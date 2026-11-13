import pool from "./connection.js";

//Check whether the hiker already has a confirmed booking for the slot
//Cancelled bookings do not count, so a hiker can book again after cancelling
async function hasConfirmedReservation(client, hikerId, slotId) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM reservation WHERE hiker_id = $1 AND slot_id = $2 AND status = 'confirmed'`,
    [hikerId, slotId],
  );
  return rowCount > 0;
}

//Insert a booking and return its id
async function insertReservation(client, hikerId, slotId, partySize) {
  const { rows } = await client.query(
    "INSERT INTO reservation (hiker_id, slot_id, party_size) VALUES ($1, $2, $3) RETURNING id",
    [hikerId, slotId, partySize],
  );
  return rows[0].id;
}

//Insert the seats assigned to a booking, one row per table
//A party split over 3 tables becomes 3 rows here
async function insertReservationSeats(client, reservationId, slotId, tables) {
  for (const t of tables) {
    await client.query(
      "INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats) VALUES ($1, $2, $3, $4)",
      [reservationId, t.slotTableId, slotId, t.seats],
    );
  }
}

//Data needed by the confirmation and update emails: hiker, slot and party size
//Table numbers are not included: they are not shown to the hiker (issue 24)
async function getConfirmationData(reservationId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.party_size, u.email, u.first_name, u.last_name, s.start_at, s.end_at
     FROM reservation r
     JOIN app_user u ON u.id = r.hiker_id
     JOIN slot s ON s.id = r.slot_id
     WHERE r.id = $1`,
    [reservationId],
  );
  if (rows.length === 0) return null;
  const [row] = rows;
  return {
    id: row.id,
    partySize: row.party_size,
    email: row.email,
    hikerName: `${row.first_name} ${row.last_name}`,
    startAt: row.start_at,
    endAt: row.end_at,
  };
}

async function getRequirementsByReservationId(reservationId) {
  return getReservationRequirements(pool, reservationId);
}

async function markConfirmationSent(reservationId) {
  await pool.query(
    "UPDATE reservation SET confirmation_sent_at = now() WHERE id = $1",
    [reservationId],
  );
}

//Get hiker's own current and upcoming bookings with requirements and a changeable flag
//Formatted as nested objects per API contract
async function getUpcomingBookingsByHikerId(hikerId) {
  const { rows } = await pool.query(
    `SELECT
      r.id,
      r.hiker_id,
      r.slot_id,
      r.party_size,
      r.status,
      r.created_at,
      r.updated_at,
      r.cancelled_at,
      s.start_at,
      s.end_at,
      CASE
        WHEN r.status = 'cancelled' THEN false
        WHEN s.end_at > NOW() THEN true
        ELSE false
      END as cancellable,
      CASE
        WHEN r.status = 'cancelled' THEN false
        WHEN s.start_at > NOW() + INTERVAL '48 hours' THEN true
        ELSE false
      END as changeable
    FROM reservation r
    JOIN slot s ON r.slot_id = s.id
    WHERE r.hiker_id = $1
      AND s.end_at > NOW()
    ORDER BY s.start_at ASC`,
    [hikerId],
  );

  if (rows.length === 0) return [];

  const reservationIds = rows.map((r) => r.id);
  const { rows: reqRows } = await pool.query(
    `SELECT id, reservation_id, people_count, has_allergies, description
     FROM reservation_requirement
     WHERE reservation_id = ANY($1::int[])
     ORDER BY id ASC`,
    [reservationIds],
  );

  const reqByReservation = new Map();
  for (const req of reqRows) {
    const list = reqByReservation.get(req.reservation_id) ?? [];
    list.push({
      id: req.id,
      peopleCount: req.people_count,
      hasAllergies: req.has_allergies,
      description: req.description,
    });
    reqByReservation.set(req.reservation_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    partySize: row.party_size,
    status: row.status,
    slot: {
      id: row.slot_id,
      startAt: row.start_at,
      endAt: row.end_at,
    },
    cancellable: row.cancellable,
    changeable: row.changeable,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at ?? null,
    requirements: reqByReservation.get(row.id) ?? [],
  }));
}

//Lock the booking and fetch its current slot start time
//Fails to find the row (returns undefined) if the booking belongs to another hiker
async function getBookingForUpdate(client, reservationId, hikerId) {
  const { rows } = await client.query(
    `SELECT
      r.*,
      s.start_at AS current_slot_start
    FROM reservation r
    JOIN slot s ON r.slot_id = s.id
    WHERE r.id = $1 AND r.hiker_id = $2
    FOR UPDATE OF r`,
    [reservationId, hikerId],
  );
  return rows[0];
}

//Lock slots in ascending id order to prevent deadlocks
async function lockSlotsInOrder(client, slotIds) {
  const { rows } = await client.query(
    `SELECT *
     FROM slot
     WHERE id = ANY($1::int[])
     ORDER BY id ASC
     FOR UPDATE`,
    [slotIds],
  );
  return rows;
}

//Release the current seats assigned to a booking
//Must be done before updating reservation.slot_id due to composite FK (reservation_id, slot_id)
async function deleteReservationSeats(client, reservationId) {
  await client.query(
    "DELETE FROM reservation_seat WHERE reservation_id = $1",
    [reservationId],
  );
}

//Update the slot, party size and set updated_at
async function updateReservation(client, reservationId, slotId, partySize) {
  await client.query(
    `UPDATE reservation
     SET slot_id = $1, party_size = $2, updated_at = NOW()
     WHERE id = $3`,
    [slotId, partySize, reservationId],
  );
}

//Fetch current seats assigned to a booking along with free seats on each table
async function getBookingSeatsWithAvailability(client, reservationId, slotId) {
  const { rows } = await client.query(
    `SELECT
      rs.slot_table_id AS "slotTableId",
      rs.seats AS "bookedSeats",
      st.seats,
      (st.seats - COALESCE((
        SELECT SUM(rs2.seats)
        FROM reservation_seat rs2
        JOIN reservation r2 ON r2.id = rs2.reservation_id
        WHERE rs2.slot_table_id = st.id
          AND rs2.slot_id = $2
          AND r2.status = 'confirmed'
      ), 0))::int AS "freeSeats"
     FROM reservation_seat rs
     JOIN slot_table st ON st.id = rs.slot_table_id
     WHERE rs.reservation_id = $1`,
    [reservationId, slotId],
  );
  return rows;
}

//Update seat count on a specific table for a booking
async function updateReservationSeatCount(client, reservationId, slotTableId, seats) {
  await client.query(
    `UPDATE reservation_seat
     SET seats = $1
     WHERE reservation_id = $2 AND slot_table_id = $3`,
    [seats, reservationId, slotTableId],
  );
}

//Release a specific table when its assigned seats drop to 0
async function deleteSingleReservationSeat(client, reservationId, slotTableId) {
  await client.query(
    `DELETE FROM reservation_seat
     WHERE reservation_id = $1 AND slot_table_id = $2`,
    [reservationId, slotTableId],
  );
}

//Fetch requirements attached to a reservation (MH-05)
async function getReservationRequirements(client, reservationId) {
  const { rows } = await client.query(
    `SELECT id, people_count, has_allergies, description
     FROM reservation_requirement
     WHERE reservation_id = $1
     ORDER BY id ASC`,
    [reservationId],
  );
  return rows.map((row) => ({
    id: row.id,
    peopleCount: row.people_count,
    hasAllergies: row.has_allergies,
    description: row.description,
  }));
}

//Delete all requirements of a booking before replacing them (MH-06)
async function deleteReservationRequirements(client, reservationId) {
  await client.query(
    "DELETE FROM reservation_requirement WHERE reservation_id = $1",
    [reservationId],
  );
}

//Insert the requirements for a booking, one row per requirement item (MH-05/06)
async function insertReservationRequirements(client, reservationId, requirements) {
  for (const req of requirements) {
    await client.query(
      `INSERT INTO reservation_requirement (reservation_id, people_count, has_allergies, description)
       VALUES ($1, $2, $3, $4)`,
      [
        reservationId,
        req.peopleCount,
        Boolean(req.hasAllergies),
        req.description.trim(),
      ],
    );
  }
}

export default {
  hasConfirmedReservation,
  insertReservation,
  insertReservationSeats,
  getConfirmationData,
  markConfirmationSent,
  getUpcomingBookingsByHikerId,
  getBookingForUpdate,
  lockSlotsInOrder,
  deleteReservationSeats,
  updateReservation,
  getBookingSeatsWithAvailability,
  updateReservationSeatCount,
  deleteSingleReservationSeat,
  getReservationRequirements,
  deleteReservationRequirements,
  insertReservationRequirements,
  getRequirementsByReservationId,
};