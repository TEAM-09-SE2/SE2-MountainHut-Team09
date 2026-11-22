import pool from "./connection.js";

async function searchHikers(query) {
  const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
  const searchPattern = `%${escapedQuery}%`;
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, phone, is_temporary
     FROM app_user
     WHERE role = 'hiker'
       AND (
         first_name ILIKE $1 ESCAPE '\\'
         OR last_name ILIKE $1 ESCAPE '\\'
         OR (first_name || ' ' || last_name) ILIKE $1 ESCAPE '\\'
         OR phone ILIKE $1 ESCAPE '\\'
         OR email ILIKE $1 ESCAPE '\\'
       )
     ORDER BY last_name, first_name, id`,
    [searchPattern],
  );

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    isTemporary: row.is_temporary,
  }));
}

export default { searchHikers };
