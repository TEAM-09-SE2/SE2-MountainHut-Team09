import pool from "./connection.js";

async function listEmployees() {
  const { rows } = await pool.query(
    `SELECT id, email, first_name AS "firstName", last_name AS "lastName", phone,
            must_change_password AS "mustChangePassword", created_at AS "createdAt"
     FROM app_user WHERE role = 'employee'
     ORDER BY last_name, first_name, id`,
  );
  return rows;
}

export default { listEmployees };
