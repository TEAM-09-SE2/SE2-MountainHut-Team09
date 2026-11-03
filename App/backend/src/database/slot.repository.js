import pool from "./connection.js";

async function hasOverlappingSlot(client, startAt, endAt) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('slot-time-overlap'))");

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
      [slot.id, JSON.stringify(tables)]
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

    const sourceSlot = await client.query("SELECT id FROM slot WHERE id = $1 FOR SHARE", [copyTablesFromSlotId]);

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
      [startAt, endAt, createdBy]
    );
    const slot = slotResult.rows[0];
    const tableResult = await client.query(
      `INSERT INTO slot_table (slot_id, table_number, seats)
       SELECT $1, table_number, seats
       FROM slot_table
       WHERE slot_id = $2
       ORDER BY table_number
       RETURNING id, table_number, seats`,
      [slot.id, copyTablesFromSlotId]
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

export default { getSlotById, createSlot, copySlot };