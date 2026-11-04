import { ForbiddenError, UnauthorizedError } from "../errors/ErrorClass.js";

//req.user is set by Passport after login
export function isLoggedIn(req, res, next) {
  if (!req.user) return next(new UnauthorizedError("Login required.", "NOT_AUTHENTICATED"));
  next();
}

//Use after isLoggedIn, e.g. hasRole("employee", "warden") for staff-only routes
export function hasRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(new ForbiddenError());
    next();
  };
}
