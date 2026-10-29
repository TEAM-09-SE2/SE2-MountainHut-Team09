import crypto from 'crypto';

/**
 * Generates a random 16-byte salt (32 hex characters) and a PBKDF2 hash (64 hex characters)
 * matching the PostgreSQL schema constraints: salt VARCHAR(32) and password_hash VARCHAR(64).
 *
 * @param {string} password - The plain text password
 * @returns {{ salt: string, hash: string }}
 */
export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex'); // 32 hex characters
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex'); // 64 hex characters
  return { salt, hash };
};

/**
 * Verifies a plain text password against a stored salt and hash using timing-safe comparison.
 *
 * @param {string} password - Plain text password to check
 * @param {string} salt - Stored salt from DB
 * @param {string} storedHash - Stored hash from DB
 * @returns {boolean} True if password matches, false otherwise
 */
export const verifyPassword = (password, salt, storedHash) => {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
};