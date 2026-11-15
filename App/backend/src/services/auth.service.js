import authRepository from "../database/auth.repository.js";
import { hashPassword, verifyPassword } from "../utils/cryptoUtils.js";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from "../errors/ErrorClass.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new BadRequestError(`${fieldName} must be a string.`, "INVALID_INPUT");
  }

  return value.trim() || null;
}

function validatePhone(phone) {
  if (phone !== null && (phone.length > 10 || !/^\d+$/.test(phone))) {
    throw new BadRequestError("Phone number must contain only digits and be at most 10 characters long.", "INVALID_INPUT");
  }
}

// Shared account validation; the caller, never the request body, chooses the role.
export async function createAccount({
  email,
  password,
  firstName,
  lastName,
  phone,
  emergencyContactName,
  emergencyContactPhone,
  notes,
}, { role = "hiker", mustChangePassword = false } = {}) {
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
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

  if (email.trim().length > 255 || firstName.trim().length > 100 || lastName.trim().length > 100) {
    throw new BadRequestError("Email must be at most 255 characters and names at most 100 characters long.", "INVALID_INPUT");
  }

  const formattedPhone = normalizeOptionalString(phone, "Phone number");
  validatePhone(formattedPhone);

  const formattedEmergencyContactName = normalizeOptionalString(
    emergencyContactName,
    "Emergency contact name",
  );
  if (formattedEmergencyContactName?.length > 100) {
    throw new BadRequestError("Emergency contact name must be at most 100 characters long.", "INVALID_INPUT");
  }

  const formattedEmergencyContactPhone = normalizeOptionalString(emergencyContactPhone, "Emergency contact phone",);
  validatePhone(formattedEmergencyContactPhone);

  if (Boolean(formattedEmergencyContactName) !== Boolean(formattedEmergencyContactPhone)) {
    throw new BadRequestError("Emergency contact name and phone must be provided together.", "INVALID_INPUT");
  }

  const formattedNotes = normalizeOptionalString(notes, "Notes");
  if (formattedNotes?.length > 1000) {
    throw new BadRequestError("Notes must be at most 1000 characters long.", "INVALID_INPUT");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await authRepository.findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new ConflictError("An account with this email already exists.", "EMAIL_ALREADY_USED");
  }

  const { hash, salt } = hashPassword(password);

  try {
    return await authRepository.createUser({
      email: normalizedEmail,
      hash,
      salt,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: formattedPhone,
      emergencyContactName: formattedEmergencyContactName,
      emergencyContactPhone: formattedEmergencyContactPhone,
      notes: formattedNotes,
      role,
      mustChangePassword,
    });
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT" ||
      error.code === "23505" ||
      (error.message && error.message.includes("UNIQUE"))
    ) {
      throw new ConflictError("An account with this email already exists.", "EMAIL_ALREADY_USED");
    }
    throw error;
  }
}

async function registerUser(input) {
  return createAccount(input);
}

async function loginUser({ email, password }) {
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
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
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

async function changePassword(id, { currentPassword, newPassword }) {
  if (typeof currentPassword !== "string" || !currentPassword ||
      typeof newPassword !== "string" || newPassword.length < 8 ||
      newPassword === currentPassword) {
    throw new BadRequestError("Provide the current password and a different new password of at least 8 characters.", "INVALID_INPUT");
  }

  const user = await authRepository.findCredentialsById(id);
  if (!user) {
    throw new UnauthorizedError("User is not authenticated.", "NOT_AUTHENTICATED");
  }
  if (!verifyPassword(currentPassword, user.salt, user.password_hash)) {
    throw new UnauthorizedError("Invalid current password.", "INVALID_CREDENTIALS");
  }

  const { hash, salt } = hashPassword(newPassword);
  // Compare the old hash in the UPDATE so concurrent changes cannot reuse it.
  const changed = await authRepository.updatePassword(id, user.password_hash, hash, salt);
  if (!changed) {
    throw new UnauthorizedError("Invalid current password.", "INVALID_CREDENTIALS");
  }
}

async function getCurrentUser(id) {
  const user = await authRepository.findUserById(id);
  if (!user) {
    throw new UnauthorizedError("User is not authenticated.", "NOT_AUTHENTICATED");
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    notes: user.notes,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export default { registerUser, loginUser, getCurrentUser, changePassword };
