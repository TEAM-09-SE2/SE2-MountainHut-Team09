import crypto from 'crypto';

/**
 * Generates a random 16-byte salt (32 hex characters) and a PBKDF2 hash (64 hex characters)
 * matching PostgreSQL schema constraints.
 *
 * @param {string} password
 * @returns {{ salt: string, hash: string }}
 */
export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex'); // 64 hex chars
  return { salt, hash };
};

/**
 * Verifies a plain text password against a stored salt and hash using timing-safe comparison.
 *
 * @param {string} password Plain text password to check
 * @param {string} salt Stored salt from DB
 * @param {string} storedHash Stored hash from DB
 * @returns {boolean} True if password matches, false otherwise
 */
export const verifyPassword = (password, salt, storedHash) => {
  if (!password || !salt || typeof storedHash !== 'string') {
    return false;
  }

  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');

  const hashBuffer = Buffer.from(hash, 'utf-8');
  const storedBuffer = Buffer.from(storedHash, 'utf-8');

  if (hashBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, storedBuffer);
};