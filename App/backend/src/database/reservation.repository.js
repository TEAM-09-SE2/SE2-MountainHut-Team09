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
  return {
    id: row.id,
    partySize: row.party_size,
    email: row.email,
    hikerName: `${row.first_name} ${row.last_name}`,
    startAt: row.start_at,
    endAt: row.end_at,
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
  getConfirmationData,
  markConfirmationSent,
};
