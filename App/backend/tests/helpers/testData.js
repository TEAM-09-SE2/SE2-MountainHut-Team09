// Shared helpers that create and delete the database rows used by integration and e2e tests.
import pool from "../../src/database/connection.js";

// Deletes the test users (by email pattern and, optionally, by the last name of
// temporary hikers), their slots and every reservation linked to them.
export async function purgeTestUsers(emailPattern, temporaryLastName = null) {
  const testUsers = "SELECT id FROM app_user WHERE email LIKE $1 OR last_name = $2";
  const params = [emailPattern, temporaryLastName];
  await pool.query(`DELETE FROM reservation WHERE hiker_id IN (${testUsers}) OR slot_id IN (SELECT id FROM slot WHERE created_by IN (${testUsers}))`, params);
  await pool.query(`DELETE FROM slot WHERE created_by IN (${testUsers})`, params);
  await pool.query("DELETE FROM app_user WHERE email LIKE $1 OR last_name = $2", params);
}

// Inserts a slot with its tables ({ tableNumber: seats }) and returns the slot id.
export async function insertSlot(createdBy, startAt, endAt, seatsByTable) {
  const { rows: [slot] } = await pool.query("INSERT INTO slot (start_at, end_at, created_by) VALUES ($1, $2, $3) RETURNING id", [startAt, endAt, createdBy]);
  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    await pool.query("INSERT INTO slot_table (slot_id, table_number, seats) VALUES ($1, $2, $3)", [slot.id, tableNumber, seats]);
  }
  return slot.id;
}

// Inserts a booking directly in the database, with all its seats on the first table of the slot.
export async function insertBooking(hikerId, slotId, partySize) {
  const { rows: [reservation] } = await pool.query(
    "INSERT INTO reservation (hiker_id, slot_id, party_size) VALUES ($1, $2, $3) RETURNING id",
    [hikerId, slotId, partySize],
  );
  const { rows: [table] } = await pool.query("SELECT id FROM slot_table WHERE slot_id = $1 ORDER BY table_number LIMIT 1", [slotId]);
  await pool.query(
    "INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats) VALUES ($1, $2, $3, $4)",
    [reservation.id, table.id, slotId, partySize],
  );
  return reservation.id;
}
