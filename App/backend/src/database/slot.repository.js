import pool from "./connection.js";

async function hasOverlappingSlot(client, startAt, endAt) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('slot-time-overlap'))",
  );

  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM slot
       WHERE start_at < $2 AND end_at > $1
     ) AS overlaps`,
    [startAt, endAt],
  );

  return result.rows[0].overlaps;
}

function mapSlot(slot, tables) {
  return {
    id: slot.id,
    startAt: slot.start_at.toISOString(),
    endAt: slot.end_at.toISOString(),
    totalSeats: tables.reduce((total, table) => total + Number(table.seats), 0),
    tables: tables.map((table) => ({
      id: table.id,
      tableNumber: table.table_number,
      seats: table.seats,
      ...(table.free_seats === undefined
        ? {}
        : { freeSeats: Number(table.free_seats) }),
    })),
  };
}

async function getSlotById(slotId) {
  const result = await pool.query(
    `SELECT s.id, s.start_at, s.end_at,
            st.id AS table_id, st.table_number, st.seats, stf.free_seats
     FROM slot s
     LEFT JOIN slot_table st ON st.slot_id = s.id
     LEFT JOIN slot_table_free stf ON stf.slot_table_id = st.id
     WHERE s.id = $1
     ORDER BY st.table_number`,
    [slotId],
  );

  if (result.rowCount === 0) return null;

  const slot = {
    id: result.rows[0].id,
    start_at: result.rows[0].start_at,
    end_at: result.rows[0].end_at,
  };
  const tables = result.rows
    .filter((row) => row.table_id !== null)
    .map((row) => ({
      id: row.table_id,
      table_number: row.table_number,
      seats: row.seats,
      free_seats: row.free_seats,
    }));

  return mapSlot(slot, tables);
}

async function createSlot({ startAt, endAt, tables, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    if (await hasOverlappingSlot(client, startAt, endAt)) {
      await client.query("ROLLBACK");
      return { overlap: true };
    }

    const slotResult = await client.query(
      `INSERT INTO slot (start_at, end_at, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, start_at, end_at`,
      [startAt, endAt, createdBy],
    );
    const slot = slotResult.rows[0];
    const tableResult = await client.query(
      `INSERT INTO slot_table (slot_id, table_number, seats)
       SELECT $1, input_table."tableNumber", input_table.seats
       FROM jsonb_to_recordset($2::jsonb) AS input_table("tableNumber" integer, seats integer)
       RETURNING id, table_number, seats`,
      [slot.id, JSON.stringify(tables)],
    );
    const tableRows = tableResult.rows;
    tableRows.sort((left, right) => left.table_number - right.table_number);
    const result = mapSlot(slot, tableRows);
    await client.query("COMMIT");

    return { overlap: false, slot: result };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function copySlot({ startAt, endAt, copyTablesFromSlotId, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sourceSlot = await client.query(
      "SELECT id FROM slot WHERE id = $1 FOR SHARE",
      [copyTablesFromSlotId],
    );

    if (sourceSlot.rowCount === 0) {
      await client.query("ROLLBACK");
      return { overlap: false, sourceNotFound: true };
    }

    if (await hasOverlappingSlot(client, startAt, endAt)) {
      await client.query("ROLLBACK");
      return { overlap: true };
    }

    const slotResult = await client.query(
      `INSERT INTO slot (start_at, end_at, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, start_at, end_at`,
      [startAt, endAt, createdBy],
    );
    const slot = slotResult.rows[0];
    const tableResult = await client.query(
      `INSERT INTO slot_table (slot_id, table_number, seats)
       SELECT $1, table_number, seats
       FROM slot_table
       WHERE slot_id = $2
       ORDER BY table_number
       RETURNING id, table_number, seats`,
      [slot.id, copyTablesFromSlotId],
    );
    const tableRows = tableResult.rows;
    tableRows.sort((left, right) => left.table_number - right.table_number);
    const result = mapSlot(slot, tableRows);
    await client.query("COMMIT");

    return { overlap: false, slot: result };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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
//We lock the slot and not the tables because FOR UPDATE is not allowed on the slot_table_free view
//The 2 hours check uses the DB clock, so it does not depend on the server time zone
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
//The view already ignores cancelled bookings
async function findFreeTablesBySlotId(client, slotId) {
  const FIND_FREE_TABLES_QUERY = `
    SELECT slot_table_id, table_number, free_seats::int AS free_seats
    FROM slot_table_free
    WHERE slot_id = $1 AND free_seats > 0
  `;
  const { rows } = await client.query(FIND_FREE_TABLES_QUERY, [slotId]);
  return rows.map((r) => ({
    slotTableId: r.slot_table_id,
    tableNumber: r.table_number,
    freeSeats: r.free_seats,
  }));
}
export default {
  getSlotById,
  createSlot,
  copySlot,
  findSlotsByDate,
  lockSlotById,
  findFreeTablesBySlotId,
};
