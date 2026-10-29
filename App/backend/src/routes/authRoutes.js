import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../database/connection.js'; 
import { requireAuth } from '../middlewares/auth.js';
import AppError from '../errors/ErrorClass.js';
import { hashPassword, verifyPassword } from '../utils/cryptoUtils.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'skyreach-secret-key';

/**
 * POST /api/v1/auth/register
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      throw new AppError(400, 'INVALID_INPUT');
    }

    // Validate phone number length to respect DB VARCHAR(10) constraint
    if (phone && phone.length > 10) {
      throw new AppError(400, 'INVALID_INPUT');
    }

    // Check if email is already registered
    const existingUserResult = await pool.query(
      'SELECT id FROM app_user WHERE email = $1',
      [email]
    );

    if (existingUserResult.rows.length > 0) {
      throw new AppError(409, 'EMAIL_ALREADY_USED');
    }

    // Password hashing (salt + hash)
    const { salt, hash } = hashPassword(password);

    // Insert new user into DB with default 'hiker' role
    const insertQuery = `
      INSERT INTO app_user (email, password_hash, salt, first_name, last_name, phone, role)
      VALUES ($1, $2, $3, $4, $5, $6, 'hiker')
      RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role
    `;

    const values = [email, hash, salt, firstName, lastName, phone || null];
    const result = await pool.query(insertQuery, values);
    const newUser = result.rows[0];

    return res.status(201).json(newUser);
  } catch (error) {
    // Handle PostgreSQL UNIQUE constraint violation (error code 23505)
    if (error.code === '23505') {
      return next(new AppError(409, 'EMAIL_ALREADY_USED'));
    }
    next(error);
  }
});

/**
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'INVALID_INPUT');
    }

    // Retrieve user by email
    const query = `
      SELECT id, email, password_hash, salt, first_name AS "firstName", last_name AS "lastName", role
      FROM app_user
      WHERE email = $1
    `;
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      throw new AppError(401, 'INVALID_CREDENTIALS');
    }

    const user = result.rows[0];

    // Verify password against stored salt
    const isPasswordValid = verifyPassword(password, user.salt, user.password_hash);
    if (!isPasswordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS');
    }

    // Generate JWT payload
    const tokenPayload = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1d' });

    // Set HTTP-Only cookie for session management
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 */
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('token');
  return res.status(204).send();
});

/**
 * GET /api/v1/auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    role: req.user.role
  });
});

export default router;