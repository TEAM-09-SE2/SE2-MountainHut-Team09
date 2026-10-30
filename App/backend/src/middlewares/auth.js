import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/ErrorClass.js';

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return next(new UnauthorizedError("User is not authenticated"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (err) {
    return next(new UnauthorizedError("Invalid or expired token"));
  }
};