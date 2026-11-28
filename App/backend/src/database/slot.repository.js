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

    //Not a duplicate of the lock in hasOverlappingSlot: it must be taken BEFORE the FOR SHARE below.
    //copyWeek (MH-09) takes this advisory lock first and then the slot rows; locking the source
    //row first here could deadlock with a copy-week whose target weeks contain that slot.
    //Taking it again in hasOverlappingSlot is harmless: advisory locks are re-entrant in a transaction.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('slot-time-overlap'))",
    );

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
    SELECT id, start_at,
           start_at - now() >= interval '2 hours' AS bookable,
           start_at <= now() AS started
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
//copy every slot of a week (with its tables) into one or more following weeks.
//Returns a flag for every business rule that fails, so the service can map it to an error.
async function copyWeek({ sourceWeekStart, targetWeekStart, weeks, copyMenus, dayOffset, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    //1. Same advisory lock as MH-02: copies and slot creations run one after the other
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('slot-time-overlap'))",
    );

    //The target weeks must start after today (hut local date, database clock)
    const todayResult = await client.query(
      `SELECT $1::date > (now() AT TIME ZONE 'Europe/Rome')::date AS valid`,
      [targetWeekStart],
    );
    if (!todayResult.rows[0].valid) {
      await client.query("ROLLBACK");
      return { targetWeekNotValid: true };
    }

    //2. Lock the source and target slots in one query, FOR UPDATE and in ascending id order,
    //the same order MH-06 uses when it locks the two slots of a booking change: otherwise a
    //change from a source slot to a target slot with a lower id could deadlock with the copy.
    //- source: every slot that starts in the source week, also if it ends in the next one;
    //  the lock keeps them (and their tables and menus) stable while they are copied
    //- target: every slot that starts in the target weeks; the lock stops bookings on a slot
    //  while it is being replaced (same row lock as MH-01/MH-07)
    //The target weeks never include the source week (checked in the service), so the two sets are disjoint.
    const lockedResult = await client.query(
      `SELECT id,
              start_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Rome')
          AND start_at <  (($1::date + 7)::timestamp AT TIME ZONE 'Europe/Rome') AS is_source
       FROM slot
       WHERE (start_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Rome')
              AND start_at < (($1::date + 7)::timestamp AT TIME ZONE 'Europe/Rome'))
          OR (start_at >= ($2::date::timestamp AT TIME ZONE 'Europe/Rome')
              AND start_at < (($2::date + $3::int * 7)::timestamp AT TIME ZONE 'Europe/Rome'))
       ORDER BY id
       FOR UPDATE`,
      [sourceWeekStart, targetWeekStart, weeks],
    );
    const sourceIds = lockedResult.rows.filter((row) => row.is_source).map((row) => row.id);
    const targetIds = lockedResult.rows.filter((row) => !row.is_source).map((row) => row.id);

    if (sourceIds.length === 0) {
      await client.query("ROLLBACK");
      return { sourceEmpty: true };
    }

    if (targetIds.length > 0) {
      //A reservation of any status blocks the copy: cancelled ones are kept as history (MH-08)
      const reservationResult = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM reservation WHERE slot_id = ANY($1::int[])
         ) AS has_reservations`,
        [targetIds],
      );
      if (reservationResult.rows[0].has_reservations) {
        await client.query("ROLLBACK");
        return { targetHasReservations: true };
      }

      //Replace the existing schedule: slot_table rows go with ON DELETE CASCADE
      await client.query("DELETE FROM slot WHERE id = ANY($1::int[])", [
        targetIds,
      ]);
    }

    //3. Create the copies set-based, in two statements whatever the number of weeks and slots,
    //so the locks above are held for a constant number of round trips (not two per copied slot).
    //Times are shifted in hut local time, so a 12:00 slot stays at 12:00 across a daylight saving
    //change. If the shift makes end <= start (only possible around a DST change at night), the
    //original duration is kept instead.

    //3a. One row per copy (every source slot x every target week), all inserted at once.
    //INSERT ... RETURNING cannot return the source id, so the new ids are taken from the slot
    //sequence in the plan CTE and joined back to get the source id -> new id mapping.
    //MATERIALIZED guarantees nextval() runs once per row, although plan is read twice.
    const slotResult = await client.query(
      `WITH plan AS MATERIALIZED (
         SELECT nextval(pg_get_serial_sequence('slot', 'id'))::int AS new_id,
                s.id AS source_id,
                ((s.start_at AT TIME ZONE 'Europe/Rome') + make_interval(days => $2::int + 7 * w.week))
                  AT TIME ZONE 'Europe/Rome' AS new_start,
                ((s.end_at AT TIME ZONE 'Europe/Rome') + make_interval(days => $2::int + 7 * w.week))
                  AT TIME ZONE 'Europe/Rome' AS new_end,
                s.end_at - s.start_at AS duration,
                s.menu
         FROM slot s
         CROSS JOIN generate_series(0, $3::int - 1) AS w(week)
         WHERE s.id = ANY($1::int[])
       ),
       new_slots AS (
         INSERT INTO slot (id, start_at, end_at, created_by, menu)
         SELECT new_id,
                new_start,
                CASE WHEN new_end > new_start THEN new_end ELSE new_start + duration END,
                $4,
                CASE WHEN $5::boolean THEN menu ELSE NULL END
         FROM plan
         RETURNING id, start_at, end_at
       )
       SELECT new_slots.id, new_slots.start_at, new_slots.end_at, plan.source_id
       FROM new_slots
       JOIN plan ON plan.new_id = new_slots.id
       ORDER BY new_slots.start_at, new_slots.id`,
      [sourceIds, dayOffset, weeks, createdBy, copyMenus],
    );

    //3b. Copy the table layout of every source slot into all its copies at once, never the reservations
    const tableResult = await client.query(
      `INSERT INTO slot_table (slot_id, table_number, seats)
       SELECT copy.new_id, st.table_number, st.seats
       FROM unnest($1::int[], $2::int[]) AS copy(new_id, source_id)
       JOIN slot_table st ON st.slot_id = copy.source_id
       RETURNING slot_id, seats`,
      [slotResult.rows.map((row) => row.id), slotResult.rows.map((row) => row.source_id)],
    );

    const seatsBySlot = new Map();
    for (const table of tableResult.rows) {
      seatsBySlot.set(table.slot_id, (seatsBySlot.get(table.slot_id) ?? 0) + Number(table.seats));
    }

    //Already ordered by start in SQL
    const createdSlots = slotResult.rows.map((row) => ({
      id: row.id,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      totalSeats: seatsBySlot.get(row.id) ?? 0,
    }));

    //A copy must not overlap a slot that was not replaced (e.g. one starting just after the
    //last target week), nor another copy (e.g. a Sunday 23:00-01:00 slot and the next Monday 00:30).
    //Back-to-back slots do not overlap.
    const overlapResult = await client.query(
      `SELECT EXISTS (
         SELECT 1
         FROM slot copied
         JOIN slot other
           ON other.id <> copied.id
          AND other.start_at < copied.end_at
          AND other.end_at > copied.start_at
         WHERE copied.id = ANY($1::int[])
       ) AS overlaps`,
      [createdSlots.map((slot) => slot.id)],
    );
    if (overlapResult.rows[0].overlaps) {
      await client.query("ROLLBACK");
      return { overlap: true };
    }

    await client.query("COMMIT");

    return { createdSlots, replacedSlots: targetIds.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default {
  getSlotById,
  copyWeek,
  createSlot,
  copySlot,
  findSlotsByDate,
  lockSlotById,
  findFreeTablesBySlotId,
};
