import pool from "./connection.js";

//Return the slots of a day (hut local time) with their seats and whether they can still be booked
async function findSlotsByDate(date) {
  const FIND_SLOTS_QUERY = `
    SELECT s.id, s.start_at, s.end_at,
           COALESCE(SUM(f.seats), 0)::int      AS total_seats,
           COALESCE(SUM(f.free_seats), 0)::int AS free_seats,
           s.start_at - now() >= interval '2 hours' AS bookable
    FROM slot s
    LEFT JOIN slot_table_free f ON f.slot_id = s.id
    WHERE (s.start_at AT TIME ZONE 'Europe/Rome')::date = $1
    GROUP BY s.id
    ORDER BY s.start_at
  `;
  const { rows } = await pool.query(FIND_SLOTS_QUERY, [date]);
  return rows.map((r) => ({
    id: r.id,
    startAt: r.start_at,
    endAt: r.end_at,
    totalSeats: r.total_seats,
    freeSeats: r.free_seats,
    bookable: r.bookable,
  }));
}

//Lock the slot row until the end of the transaction, so bookings for the same slot run one at a time
async function lockSlotById(client, id) {
  const LOCK_SLOT_QUERY = `
    SELECT id, start_at, start_at - now() >= interval '2 hours' AS bookable
    FROM slot
    WHERE id = $1
    FOR UPDATE
  `;
  const { rows } = await client.query(LOCK_SLOT_QUERY, [id]);
  return rows[0];
}

//Return the tables of a slot that still have free seats
async function findFreeTablesBySlotId(client, slotId) {
  const FIND_FREE_TABLES_QUERY = `
    SELECT slot_table_id, table_number, free_seats::int AS free_seats
    FROM slot_table_free
    WHERE slot_id = $1 AND free_seats > 0
  `;
  const { rows } = await client.query(FIND_FREE_TABLES_QUERY, [slotId]);
  return rows.map((r) => ({ slotTableId: r.slot_table_id, tableNumber: r.table_number, freeSeats: r.free_seats }));
}

export default {
  findSlotsByDate,
  lockSlotById,
  findFreeTablesBySlotId,
};
