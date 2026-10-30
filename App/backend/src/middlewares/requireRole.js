import { ForbiddenError, UnauthorizedError } from '../errors/ErrorClass.js';

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("User is not authenticated"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError("Access denied: Insufficient permissions"));
    }

    next();
  };
};