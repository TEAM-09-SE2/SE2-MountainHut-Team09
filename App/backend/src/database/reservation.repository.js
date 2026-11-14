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
// Insert the notes and allergies for a reservation
async function insertReservationRequirements(client, reservationId, requirements) {
  const savedRequirements = [];
  for (const requirement of requirements) {
    const { rows } = await client.query(
      `INSERT INTO reservation_requirement
         (reservation_id, people_count, has_allergies, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        reservationId,
        requirement.peopleCount,
        requirement.hasAllergies,
        requirement.description,
      ],
    );
    savedRequirements.push({ id: rows[0].id, ...requirement });
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

//Data needed by the confirmation email: hiker and slot
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
  const { rows: requirementRows } = await pool.query(
    `SELECT people_count, has_allergies, description
     FROM reservation_requirement
     WHERE reservation_id = $1
     ORDER BY has_allergies DESC, id`,
    [reservationId],
  );
  return {
    id: row.id,
    partySize: row.party_size,
    email: row.email,
    hikerName: `${row.first_name} ${row.last_name}`,
    startAt: row.start_at,
    endAt: row.end_at,
    requirements: requirementRows.map((requirement) => ({
      peopleCount: requirement.people_count,
      hasAllergies: requirement.has_allergies,
      description: requirement.description,
    })),
  };
}

async function markConfirmationSent(reservationId) {
  await pool.query(
    "UPDATE reservation SET confirmation_sent_at = now() WHERE id = $1",
    [reservationId],
  );
}

export default {
  hasConfirmedReservation,
  insertReservation,
  insertReservationSeats,
  insertReservationRequirements,
  getStaffReservations,
  getConfirmationData,
  markConfirmationSent,
};
