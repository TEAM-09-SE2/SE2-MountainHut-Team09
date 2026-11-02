import authRepository from "../database/auth.repository.js";
import { hashPassword, verifyPassword } from "../utils/cryptoUtils.js";
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from "../errors/ErrorClass.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function registerUser({ email, password, firstName, lastName, phone }) {
  if (!email || !EMAIL_REGEX.test(email.trim())) {
    throw new BadRequestError("Invalid email format.", "INVALID_INPUT");
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    throw new BadRequestError("Password must be at least 8 characters long.", "INVALID_INPUT");
  }

  if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
    throw new BadRequestError("First name is required.", "INVALID_INPUT");
  }

  if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
    throw new BadRequestError("Last name is required.", "INVALID_INPUT");
  }

  let formattedPhone = null;
  if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
    formattedPhone = String(phone).trim();
    if (formattedPhone.length > 10 || !/^\d+$/.test(formattedPhone)) {
      throw new BadRequestError("Phone number must contain only digits and be at most 10 characters long.", "INVALID_INPUT");
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await authRepository.findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new ConflictError("An account with this email already exists.", "EMAIL_ALREADY_USED");
  }

  const { hash, salt } = hashPassword(password);

  return await authRepository.createUser({
    email: normalizedEmail,
    hash,
    salt,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: formattedPhone,
    role: "hiker",
  });
}

async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new BadRequestError("Email and password are required.", "INVALID_INPUT");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await authRepository.findUserByEmail(normalizedEmail);

  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    throw new UnauthorizedError("Invalid email or password.", "INVALID_CREDENTIALS");
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

async function loginEmployee({ email, password }) {
  const user = await loginUser({ email, password });

  if (user.role !== "employee" && user.role !== "warden") {
    throw new ForbiddenError("Access denied: Employee or Warden account required.", "FORBIDDEN");
  }

  return user;
}

export default { registerUser, loginUser, loginEmployee };