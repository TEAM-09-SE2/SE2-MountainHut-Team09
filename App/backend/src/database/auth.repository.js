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
    `SELECT id, email, first_name AS "firstName", last_name AS "lastName", phone, role 
     FROM app_user 
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createUser({ email, hash, salt, firstName, lastName, phone, role = "hiker" }) {
  const insertQuery = `
    INSERT INTO app_user (email, password_hash, salt, first_name, last_name, phone, role)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, email, first_name AS "firstName", last_name AS "lastName", phone, role
  `;
  const { rows } = await pool.query(insertQuery, [
    email,
    hash,
    salt,
    firstName,
    lastName,
    phone || null,
    role,
  ]);
  return rows[0];
}

export default { findUserByEmail, findUserById, createUser };