import pool from "./connection.js";

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, salt, first_name AS "firstName", last_name AS "lastName", phone, role,
            must_change_password AS "mustChangePassword"
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
  mustChangePassword = false,
}) {
  const insertQuery = `
    INSERT INTO app_user (
      email, password_hash, salt, first_name, last_name, phone,
      emergency_contact_name, emergency_contact_phone, notes, role, must_change_password
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    mustChangePassword,
  ]);
  return rows[0];
}

async function findCredentialsById(id) {
  const { rows } = await pool.query(
    "SELECT password_hash, salt FROM app_user WHERE id = $1 AND is_temporary = false",
    [id],
  );
  return rows[0] || null;
}

async function updatePassword(id, previousHash, hash, salt) {
  const { rowCount } = await pool.query(
    `UPDATE app_user SET password_hash = $3, salt = $4, must_change_password = false
     WHERE id = $1 AND password_hash = $2 AND is_temporary = false`,
    [id, previousHash, hash, salt],
  );
  return rowCount === 1;
}

export default { findUserByEmail, findUserById, createUser, findCredentialsById, updatePassword };
