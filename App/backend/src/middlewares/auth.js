import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/ErrorClass.js';

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return next(new UnauthorizedError("User is not authenticated", "UNAUTHORIZED"));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error("JWT_SECRET environment variable is not defined"));
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return next(new UnauthorizedError("Invalid or expired token", "INVALID_TOKEN"));
  }
};