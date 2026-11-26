import { createHash, randomBytes } from "node:crypto";
import authRepository from "../database/auth.repository.js";
import { hashPassword, verifyPassword } from "../utils/cryptoUtils.js";
import { EMAIL_REGEX } from "../utils/emailValidation.js";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from "../errors/ErrorClass.js";
import passwordResetEmailService from "./passwordResetEmail.service.js";

const PASSWORD_RESET_TOKEN_TTL_HOURS = 24;

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

async function createAccount({
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

  if (email.trim().length > 255) {
    throw new BadRequestError(
      "Email must be at most 255 characters and names at most 100 characters long.",
      "INVALID_INPUT",
    );
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

  if (firstName.trim().length > 100 || lastName.trim().length > 100) {
    throw new BadRequestError(
      "Email must be at most 255 characters and names at most 100 characters long.",
      "INVALID_INPUT",
    );
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
    mustChangePassword: user.mustChangePassword ?? false,
  };
}

async function changePassword(id, { currentPassword, newPassword } = {}) {
  if (
    typeof currentPassword !== "string" ||
    !currentPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    newPassword === currentPassword
  ) {
    throw new BadRequestError(
      "Provide the current password and a different new password of at least 8 characters.",
      "INVALID_INPUT",
    );
  }

  const credentials = await authRepository.findCredentialsById(id);
  if (!credentials) {
    throw new UnauthorizedError("User is not authenticated.", "NOT_AUTHENTICATED");
  }
  if (!verifyPassword(currentPassword, credentials.salt, credentials.password_hash)) {
    throw new UnauthorizedError("Invalid current password.", "INVALID_CREDENTIALS");
  }

  const { hash, salt } = hashPassword(newPassword);
  const updated = await authRepository.updatePassword(
    id,
    credentials.password_hash,
    hash,
    salt,
  );
  if (!updated) {
    throw new UnauthorizedError("Invalid current password.", "INVALID_CREDENTIALS");
  }
}

// Create and email a single-use password reset link without revealing whether the email exists.
async function requestPasswordReset(email) {
  if (
    typeof email !== "string" ||
    email.trim().length > 255 ||
    !EMAIL_REGEX.test(email.trim())
  ) {
    throw new BadRequestError("Invalid email format.", "INVALID_INPUT");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await authRepository.findPasswordResetUserByEmail(normalizedEmail);

  if (!user) return;

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await authRepository.createPasswordResetToken(
    user.id,
    tokenHash,
    PASSWORD_RESET_TOKEN_TTL_HOURS,
  );
  await passwordResetEmailService.sendPasswordResetEmail(user, token);
}

// Validate a reset token, update the password, and invalidate all other active reset links.
async function confirmPasswordReset({ token, newPassword }) {
  if (typeof token !== "string" || !token) {
    throw new BadRequestError("A reset token is required.", "INVALID_INPUT");
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new BadRequestError(
      "Password must be at least 8 characters long.",
      "INVALID_INPUT",
    );
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const resetToken =
    await authRepository.findValidPasswordResetToken(tokenHash);
  if (!resetToken) {
    throw new BadRequestError(
      "The password reset token is invalid or expired.",
      "INVALID_RESET_TOKEN",
    );
  }

  const { hash, salt } = hashPassword(newPassword);
  const passwordUpdated = await authRepository.confirmPasswordReset(
    resetToken.userId,
    tokenHash,
    hash,
    salt,
  );
  if (!passwordUpdated) {
    throw new BadRequestError(
      "The password reset token is invalid or expired.",
      "INVALID_RESET_TOKEN",
    );
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

export default {
  registerUser,
  createAccount,
  loginUser,
  changePassword,
  requestPasswordReset,
  confirmPasswordReset,
  getCurrentUser,
};

export { createAccount };