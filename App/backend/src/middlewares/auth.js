import jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "../errors/ErrorClass.js";
import authRepository from "../database/auth.repository.js";

const authenticate = (allowTemporaryPassword) => async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return next(
      new UnauthorizedError("User is not authenticated", "NOT_AUTHENTICATED"),
    );
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error("JWT_SECRET environment variable is not defined"));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
    if (!Number.isInteger(decoded.id) || decoded.id <= 0 || decoded.id > 2147483647) {
      throw new Error("Invalid user ID");
    }
  } catch (err) {
    return next(
      new UnauthorizedError("Invalid or expired token", "NOT_AUTHENTICATED"),
    );
  }

  try {
    // Read current role and password state: JWT claims can outlive account changes.
    const user = await authRepository.findUserById(decoded.id);
    if (!user) {
      return next(new UnauthorizedError("User is not authenticated", "NOT_AUTHENTICATED"));
    }
    req.user = { id: user.id, role: user.role };
    if (user.mustChangePassword && !allowTemporaryPassword) {
      return next(new ForbiddenError("Change your temporary password before using the application.", "PASSWORD_CHANGE_REQUIRED"));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireAuth = authenticate(false);
// Only profile, logout and password change are available with a temporary password.
export const requireAuthAllowTemporaryPassword = authenticate(true);
