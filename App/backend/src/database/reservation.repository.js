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

export default {
  hasConfirmedReservation,
  insertReservation,
  insertReservationSeats,
};
