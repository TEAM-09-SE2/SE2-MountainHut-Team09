import pool from "./connection.js";

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, salt, first_name AS "firstName", last_name AS "lastName", phone, role 
     FROM app_user 
     WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, first_name AS "firstName", last_name AS "lastName", phone,
            emergency_contact_name AS "emergencyContactName",
            emergency_contact_phone AS "emergencyContactPhone", notes, role,
            must_change_password AS "mustChangePassword"
     FROM app_user 
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createUser({
  email,
  hash,
  salt,
  firstName,
  lastName,
  phone = null,
  emergencyContactName = null,
  emergencyContactPhone = null,
  notes = null,
  role = "hiker",
}) {
  const insertQuery = `
    INSERT INTO app_user (
      email, password_hash, salt, first_name, last_name, phone,
      emergency_contact_name, emergency_contact_phone, notes, role
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, email, first_name AS "firstName", last_name AS "lastName", phone,
      emergency_contact_name AS "emergencyContactName",
      emergency_contact_phone AS "emergencyContactPhone", notes, role
  `;
  const { rows } = await pool.query(insertQuery, [
    email,
    hash,
    salt,
    firstName,
    lastName,
    phone || null,
    emergencyContactName || null,
    emergencyContactPhone || null,
    notes || null,
    role,
  ]);
  return rows[0];
}

export default { findUserByEmail, findUserById, createUser };