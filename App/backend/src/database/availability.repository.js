import pool from "./connection.js";


//Return a slot given the date and time
async function findSlotByDateAndTime(date, time) {
    const FIND_SLOT_QUERY = `
    WITH requested_time AS (
        SELECT ($1::date + $2::time) AT TIME ZONE 'Europe/Rome' AS value
    )
    SELECT id, start_at, end_at
    FROM slot
    CROSS JOIN requested_time
    WHERE start_at <= requested_time.value
        AND requested_time.value < end_at
    ORDER BY start_at, id
    LIMIT 1
    `;
    const { rows } = await pool.query(FIND_SLOT_QUERY, [date, time]);
    return rows[0] ?? null;
}

//Return all the tables associated to a slot
async function findTablesBySlotId(slotId) {
    const FIND_SLOT_TABLES_QUERY = `
    SELECT slot_table_id, table_number, free_seats
    FROM slot_table_free
    WHERE slot_id = $1
    ORDER BY table_number
    `;

    const { rows } = await pool.query(FIND_SLOT_TABLES_QUERY, [slotId]);
    return rows;
}

export default {
    findSlotByDateAndTime,
    findTablesBySlotId,
};
