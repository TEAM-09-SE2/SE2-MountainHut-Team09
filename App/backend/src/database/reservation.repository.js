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

//Insert the party requirements of a booking, one row per requirement (MH-05), and return them with their ids
//Used when booking (MH-01) and when the hiker replaces them (MH-06)
async function insertReservationRequirements(
  client,
  reservationId,
  requirements,
) {
  const savedRequirements = [];
  for (const requirement of requirements) {
    const saved = {
      peopleCount: requirement.peopleCount,
      hasAllergies: Boolean(requirement.hasAllergies),
      description: requirement.description.trim(),
    };
    const { rows } = await client.query(
      `INSERT INTO reservation_requirement
         (reservation_id, people_count, has_allergies, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [reservationId, saved.peopleCount, saved.hasAllergies, saved.description],
    );
    savedRequirements.push({ id: rows[0].id, ...saved });
  }
  return savedRequirements;
}

//Return the reservations that match the conditions (only for employees and warden)
async function getStaffReservations(filters) {
  const conditions = [];
  const values = [];

  if (filters.date !== undefined) {
    values.push(filters.date);
    conditions.push(
      `(s.start_at AT TIME ZONE 'Europe/Rome')::date = $${values.length}::date`,
    );
  }
  if (filters.slotId !== undefined) {
    values.push(filters.slotId);
    conditions.push(`r.slot_id = $${values.length}`);
  }
  if (filters.status !== undefined) {
    values.push(filters.status);
    conditions.push(`r.status = $${values.length}`);
  }

  const whereClause =
    conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
  const client = await pool.connect();

  try {
    // A transaction is started for having a correct snapshot of the data state
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query(
      `SELECT r.id,
              s.id AS slot_id, s.start_at, s.end_at,
              r.party_size, r.status, r.created_at, r.updated_at,
              r.cancelled_at,
              r.confirmation_sent_at IS NOT NULL AS confirmation_sent,
              h.id AS hiker_id, h.email AS hiker_email, h.first_name AS hiker_first_name,
              h.last_name AS hiker_last_name, h.phone AS hiker_phone,
              h.emergency_contact_name AS hiker_emergency_contact_name,
              h.emergency_contact_phone AS hiker_emergency_contact_phone,
              h.notes AS hiker_notes, h.is_temporary AS hiker_is_temporary,
              creator.id AS creator_id, creator.first_name AS creator_first_name,
              creator.last_name AS creator_last_name, creator.role AS creator_role,
              canceller.id AS canceller_id,
              canceller.first_name AS canceller_first_name,
              canceller.last_name AS canceller_last_name,
              canceller.role AS canceller_role
       FROM reservation r
       JOIN slot s ON s.id = r.slot_id
       JOIN app_user h ON h.id = r.hiker_id
       LEFT JOIN app_user creator ON creator.id = r.created_by
       LEFT JOIN app_user canceller ON canceller.id = r.cancelled_by
       ${whereClause}
       ORDER BY s.start_at, r.created_at, r.id`,
      values,
    );

    const reservations = rows.map((row) => ({
      id: row.id,
      slot: {
        id: row.slot_id,
        startAt: row.start_at,
        endAt: row.end_at,
      },
      partySize: row.party_size,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cancelledAt: row.cancelled_at,
      cancelledBy: row.canceller_id
        ? {
            id: row.canceller_id,
            firstName: row.canceller_first_name,
            lastName: row.canceller_last_name,
            role: row.canceller_role,
          }
        : null,
      confirmationSent: row.confirmation_sent,
      hiker: {
        id: row.hiker_id,
        email: row.hiker_email,
        firstName: row.hiker_first_name,
        lastName: row.hiker_last_name,
        phone: row.hiker_phone,
        emergencyContactName: row.hiker_emergency_contact_name,
        emergencyContactPhone: row.hiker_emergency_contact_phone,
        notes: row.hiker_notes,
        isTemporary: row.hiker_is_temporary,
      },
      createdBy: row.creator_id
        ? {
            id: row.creator_id,
            firstName: row.creator_first_name,
            lastName: row.creator_last_name,
            role: row.creator_role,
          }
        : null,
      tables: [],
      hasAllergies: false,
      requirements: [],
    }));

    if (reservations.length > 0) {
      const reservationIds = reservations.map(({ id }) => id);
      const reservationsById = new Map(
        reservations.map((reservation) => [reservation.id, reservation]),
      );

      const { rows: tableRows } = await client.query(
        `SELECT rs.reservation_id, st.table_number, rs.seats
         FROM reservation_seat rs
         JOIN slot_table st ON st.id = rs.slot_table_id
         WHERE rs.reservation_id = ANY($1::int[])
         ORDER BY rs.reservation_id, st.table_number`,
        [reservationIds],
      );

      const { rows: requirementRows } = await client.query(
        `SELECT id, reservation_id, people_count, has_allergies, description
         FROM reservation_requirement
         WHERE reservation_id = ANY($1::int[])
         ORDER BY reservation_id, has_allergies DESC, id`,
        [reservationIds],
      );

      for (const row of tableRows) {
        reservationsById.get(row.reservation_id).tables.push({
          tableNumber: row.table_number,
          seats: row.seats,
        });
      }

      for (const row of requirementRows) {
        const reservation = reservationsById.get(row.reservation_id);
        reservation.requirements.push({
          id: row.id,
          peopleCount: row.people_count,
          hasAllergies: row.has_allergies,
          description: row.description,
        });
        if (row.has_allergies) reservation.hasAllergies = true;
      }
    }

    await client.query("COMMIT");
    return reservations;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
        WHEN s.start_at >= NOW() + INTERVAL '48 hours' THEN true
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
    `SELECT * FROM reservation
     WHERE id = $1 AND hiker_id = $2 FOR UPDATE`,
    [reservationId, hikerId],
  );
  if (!rows[0]) return undefined;
  const { rows: slots } = await client.query(
    "SELECT start_at FROM slot WHERE id = $1",
    [rows[0].slot_id],
  );
  return { ...rows[0], current_slot_start: slots[0].start_at };
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
  await client.query("DELETE FROM reservation_seat WHERE reservation_id = $1", [
    reservationId,
  ]);
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
async function updateReservationSeatCount(
  client,
  reservationId,
  slotTableId,
  seats,
) {
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

async function getReservationTimestamps(client, id) {
  const { rows } = await client.query(
    "SELECT created_at, updated_at FROM reservation WHERE id = $1",
    [id],
  );
  return rows[0];
}

async function getReservationState(client, reservationId) {
  const { rows } = await client.query(
    `SELECT
        r.created_at,
        r.updated_at,
        rs.slot_table_id,
        st.table_number,
        rs.seats
       FROM reservation r
       LEFT JOIN reservation_seat rs ON r.id = rs.reservation_id
       LEFT JOIN slot_table st ON rs.slot_table_id = st.id
       WHERE r.id = $1`,
    [reservationId],
  );
  return rows;
}

//Lock the booking first, then read its slot end (MH-08)
//The slot is read in a second query: with a JOIN, a slot change (MH-06) committed while
//we wait for the lock would make the row disappear and the cancel would answer 404
//With hikerId, a booking of another hiker is not found, so the API answers 404
async function getBookingForCancel(client, reservationId, hikerId = null) {
  const { rows } = await client.query(
    `SELECT id, hiker_id, slot_id, party_size, status, confirmation_sent_at
     FROM reservation
     WHERE id = $1 AND ($2::int IS NULL OR hiker_id = $2)
     FOR UPDATE`,
    [reservationId, hikerId],
  );
  if (!rows[0]) return undefined;

  const { rows: slots } = await client.query(
    "SELECT start_at, end_at FROM slot WHERE id = $1",
    [rows[0].slot_id],
  );
  return { ...rows[0], start_at: slots[0].start_at, end_at: slots[0].end_at };
}

//Mark the booking as cancelled; seats and requirements are kept as history (MH-08)
async function cancelReservation(client, reservationId, cancelledById) {
  const { rows } = await client.query(
    `WITH updated AS (
       UPDATE reservation
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2
       WHERE id = $1
       RETURNING cancelled_at, cancelled_by
     )
     SELECT updated.cancelled_at, u.id, u.first_name, u.last_name, u.role
     FROM updated JOIN app_user u ON u.id = updated.cancelled_by`,
    [reservationId, cancelledById],
  );
  return rows[0];
}

export default {
  getReservationTimestamps,
  getReservationState,
  hasConfirmedReservation,
  insertReservation,
  insertReservationSeats,
  getStaffReservations,
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
  getBookingForCancel,
  cancelReservation,
};
