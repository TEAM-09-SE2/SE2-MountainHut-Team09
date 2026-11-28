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

    //Source slots: every slot that starts in the source week, also if it ends in the next one.
    //FOR SHARE keeps them (and their tables) stable while they are copied.
    const sourceResult = await client.query(
      `SELECT id
       FROM slot
       WHERE start_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Rome')
         AND start_at <  (($1::date + 7)::timestamp AT TIME ZONE 'Europe/Rome')
       ORDER BY start_at
       FOR SHARE`,
      [sourceWeekStart],
    );
    if (sourceResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return { sourceEmpty: true };
    }
    const sourceIds = sourceResult.rows.map((row) => row.id);

    //2. Lock the slots that start in the target weeks (same row lock as MH-01/MH-07),
    //in id order, so a booking cannot be made on a slot while it is being replaced
    const targetResult = await client.query(
      `SELECT id
       FROM slot
       WHERE start_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Rome')
         AND start_at <  (($1::date + $2::int * 7)::timestamp AT TIME ZONE 'Europe/Rome')
       ORDER BY id
       FOR UPDATE`,
      [targetWeekStart, weeks],
    );
    const targetIds = targetResult.rows.map((row) => row.id);

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

    //3. Create the copies. Times are shifted in hut local time, so a 12:00 slot stays at 12:00
    //across a daylight saving change. If the shift makes end <= start (only possible around a
    //DST change at night), the original duration is kept instead.
    const createdSlots = [];
    for (let week = 0; week < weeks; week++) {
      const offsetDays = dayOffset + week * 7;
      for (const sourceId of sourceIds) {
        const slotResult = await client.query(
          `WITH shifted AS (
             -- Compute the new times once: shift by $2 calendar days in hut local time
             SELECT ((start_at AT TIME ZONE 'Europe/Rome') + make_interval(days => $2::int))
                      AT TIME ZONE 'Europe/Rome' AS new_start,
                    ((end_at AT TIME ZONE 'Europe/Rome') + make_interval(days => $2::int))
                      AT TIME ZONE 'Europe/Rome' AS new_end,
                    end_at - start_at AS duration,
                    menu
             FROM slot
             WHERE id = $1
           )
           INSERT INTO slot (start_at, end_at, created_by, menu)
           SELECT new_start,
                  -- Around a DST change at night the shifted end could come before the start:
                  -- in that case keep the original duration
                  CASE WHEN new_end > new_start THEN new_end ELSE new_start + duration END,
                  $3,
                  CASE WHEN $4::boolean THEN menu ELSE NULL END
           FROM shifted
           RETURNING id, start_at, end_at`,
          [sourceId, offsetDays, createdBy, copyMenus],
        );
        const newSlot = slotResult.rows[0];

        //Copy only the table layout, never the reservations
        const tableResult = await client.query(
          `INSERT INTO slot_table (slot_id, table_number, seats)
           SELECT $1, table_number, seats
           FROM slot_table
           WHERE slot_id = $2
           RETURNING seats`,
          [newSlot.id, sourceId],
        );

        createdSlots.push({
          id: newSlot.id,
          startAt: newSlot.start_at.toISOString(),
          endAt: newSlot.end_at.toISOString(),
          totalSeats: tableResult.rows.reduce(
            (total, table) => total + Number(table.seats),
            0,
          ),
        });
      }
    }

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

    createdSlots.sort(
      (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt) || left.id - right.id,
    );
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
