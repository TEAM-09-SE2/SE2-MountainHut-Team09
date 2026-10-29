import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/ErrorClass.js';
const JWT_SECRET = process.env.JWT_SECRET || 'skyreach-secret-key';

/**
 * Middleware to protect routes that require authentication.
 * Reads the JWT token from HTTP-Only cookies and verifies it.
 * Calls next(AppError) with 401 status and NOT_AUTHENTICATED message if token is missing or invalid.
 */
export const requireAuth = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return next(new UnauthorizedError("User is not authenticated"));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return next(new AppError(401, 'NOT_AUTHENTICATED'));
  }
};