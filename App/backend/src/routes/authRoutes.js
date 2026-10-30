import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../database/connection.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/requireRole.js';
import { 
  BadRequestError, 
  UnauthorizedError, 
  ForbiddenError, 
  ConflictError 
} from '../errors/ErrorClass.js';

const router = express.Router();

const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha512').toString('hex');
};

const verifyPassword = (password, storedHash, salt) => {
  return hashPassword(password, salt) === storedHash;
};

const sendAuthTokenCookie = (res, user) => {
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.first_name || user.firstName,
      lastName: user.last_name || user.lastName,
      role: user.role,
    },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
};

// Hiker registration
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return next(new BadRequestError("Missing required registration fields."));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await pool.query('SELECT id FROM app_user WHERE email = $1', [normalizedEmail]);

    if (existingUser.rows.length > 0) {
      return next(new ConflictError("An account with this email already exists."));
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    const insertQuery = `
      INSERT INTO app_user (email, password_hash, salt, first_name, last_name, phone, role)
      VALUES ($1, $2, $3, $4, $5, $6, 'hiker')
      RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role
    `;

    const { rows } = await pool.query(insertQuery, [
      normalizedEmail,
      passwordHash,
      salt,
      firstName.trim(),
      lastName.trim(),
      phone ? phone.trim() : null,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Hiker login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new BadRequestError("Email and password are required."));
    }

    const { rows } = await pool.query(
      'SELECT id, email, password_hash, salt, first_name, last_name, role FROM app_user WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
      return next(new UnauthorizedError("Invalid email or password."));
    }

    sendAuthTokenCookie(res, user);

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    });
  } catch (err) {
    next(err);
  }
});

// Employee login
router.post('/employee/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new BadRequestError("Email and password are required."));
    }

    const { rows } = await pool.query(
      'SELECT id, email, password_hash, salt, first_name, last_name, role FROM app_user WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
      return next(new UnauthorizedError("Invalid email or password."));
    }

    if (user.role !== 'employee' && user.role !== 'warden') {
      return next(new ForbiddenError("Access denied: Employee or Warden account required."));
    }

    sendAuthTokenCookie(res, user);

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    });
  } catch (err) {
    next(err);
  }
});

// Get current session user
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.json({ message: "Successfully logged out." });
});

// Protected employee dashboard
router.get('/employee/dashboard', requireAuth, requireRole('employee', 'warden'), (req, res) => {
  res.json({
    message: `Welcome to the Employee Dashboard, ${req.user.firstName}!`,
    user: req.user,
  });
});

export default router;