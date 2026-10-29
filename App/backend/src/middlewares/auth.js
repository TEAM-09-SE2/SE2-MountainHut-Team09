import { ErrorClass } from "../errors/ErrorClass.js";

//req.user is set by Passport after login
export function isLoggedIn(req, res, next) {
  if (!req.user) return next(new ErrorClass("Login required.", 401, "NOT_AUTHENTICATED"));
  next();
}

export function hasRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new ErrorClass("You are not allowed to perform this action.", 403, "FORBIDDEN"));
    }
    next();
  };
}
