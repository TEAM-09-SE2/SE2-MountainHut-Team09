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

// Find only the identity details needed to send a password-reset email.
async function findPasswordResetUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, first_name AS "firstName"
     FROM app_user
     WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

// Store only the token hash and set its expiration using the database clock.
async function createPasswordResetToken(userId, tokenHash, ttlHours) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize token creation with password resets for the same account.
    await client.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [
      userId,
    ]);
    await client.query(
      `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 hour'))`,
      [userId, tokenHash, ttlHours],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Find a reset token that has not been used and has not expired.
async function findValidPasswordResetToken(tokenHash) {
  const { rows } = await pool.query(
    `SELECT user_id AS "userId"
     FROM password_reset_token
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > clock_timestamp()`,
    [tokenHash],
  );
  return rows[0] || null;
}

// Update the password and invalidate every still-valid reset token atomically.
async function confirmPasswordReset(userId, tokenHash, passwordHash, salt) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the account first so concurrent confirmations and new reset requests serialize.
    await client.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [
      userId,
    ]);
    const { rows: timeRows } = await client.query(
      "SELECT clock_timestamp()::text AS reset_time",
    );

    //Timestamp used to check the token validity
    const resetTime = timeRows[0].reset_time;

    const { rows } = await client.query(
      `SELECT id
       FROM password_reset_token
       WHERE user_id = $1
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > $3::timestamptz
       FOR UPDATE`,
      [userId, tokenHash, resetTime],
    );
    if (rows.length === 0) {
      await client.query("COMMIT");
      return false;
    }

    await client.query(
      `UPDATE app_user
       SET password_hash = $1, salt = $2, must_change_password = false
       WHERE id = $3`,
      [passwordHash, salt, userId],
    );
    await client.query(
      `UPDATE password_reset_token
       SET used_at = $2::timestamptz
       WHERE user_id = $1
         AND used_at IS NULL
         AND expires_at > $2::timestamptz`,
      [userId, resetTime],
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export default {
  findUserByEmail,
  findPasswordResetUserByEmail,
  createPasswordResetToken,
  findValidPasswordResetToken,
  confirmPasswordReset,
  findUserById,
  createUser,
};