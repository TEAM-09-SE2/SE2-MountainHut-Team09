import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import authRepository from "../../../src/database/auth.repository.js";
import pool from "../../../src/database/connection.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";
import { verifyPassword } from "../../../src/utils/cryptoUtils.js";

after(async () => {
  await pool.end();
});

const createTestEmail = () => `auth-integration-${randomUUID()}@example.com`;

const validRegistration = (email) => ({ email, password: "password123", firstName: "Ada", lastName: "Lovelace" });

async function trackTestEmail(testContext, email) {
  testContext.after(async () => {
    await pool.query("DELETE FROM app_user WHERE email = $1", [email.toLowerCase()]);
  });
}

async function assertServiceError(promise, ErrorType, statusCode, code, message) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  });
}

describe("auth repository and service integration", () => {
  // Uses PostgreSQL to verify registration persists normalized fields and a password hash that can be verified.
  it("registers a user and retrieves the persisted user by email and ID", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);

    const result = await authService.registerUser({ ...validRegistration(email), email: ` ${email.toUpperCase()} `, firstName: " Ada ", lastName: " Lovelace ", phone: " 1234567890 " });
    const storedByEmail = await authRepository.findUserByEmail(email);
    const storedById = await authRepository.findUserById(result.id);

    const publicFields = {
      email,
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "1234567890",
      emergencyContactName: null,
      emergencyContactPhone: null,
      notes: null,
      role: "hiker",
    };
    assert.deepEqual(result, { id: storedByEmail.id, ...publicFields });
    assert.equal(storedByEmail.email, email);
    assert.equal(verifyPassword("password123", storedByEmail.salt, storedByEmail.password_hash), true);
    assert.deepEqual(storedById, { id: result.id, ...publicFields, mustChangePassword: false });
    assert.equal(Object.hasOwn(result, "password_hash"), false);
    assert.equal(Object.hasOwn(result, "salt"), false);
  });

  // Uses PostgreSQL to verify an omitted optional phone number is stored as NULL.
  it("stores NULL when registration omits the optional phone number", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);

    const result = await authService.registerUser(validRegistration(email));
    const storedUser = await authRepository.findUserByEmail(email);

    assert.equal(result.phone, null);
    assert.equal(storedUser.phone, null);
  });

  // Uses PostgreSQL to verify the emergency contact and notes are stored trimmed and read back by ID.
  it("stores the emergency contact and notes when registration provides them", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);

    const result = await authService.registerUser({
      ...validRegistration(email),
      emergencyContactName: " Marco Neri ",
      emergencyContactPhone: " 3337654321 ",
      notes: " Arriving by bike ",
    });
    const storedById = await authRepository.findUserById(result.id);

    for (const user of [result, storedById]) {
      assert.equal(user.emergencyContactName, "Marco Neri");
      assert.equal(user.emergencyContactPhone, "3337654321");
      assert.equal(user.notes, "Arriving by bike");
    }
  });

  // Verifies the service rejects invalid registration fields with the documented error without inserting a user.
  it("rejects invalid registration inputs", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);
    const invalidCases = [
      { input: { email: "not-an-email" }, message: "Invalid email format." },
      { input: { password: "short7" }, message: "Password must be at least 8 characters long." },
      { input: { firstName: "   " }, message: "First name is required." },
      { input: { lastName: "   " }, message: "Last name is required." },
      { input: { phone: "123-456" }, message: "Phone number must contain only digits and be at most 10 characters long." },
    ];

    for (const { input, message } of invalidCases) {
      await assertServiceError(authService.registerUser({ ...validRegistration(email), ...input }), BadRequestError, 400, "INVALID_INPUT", message);
    }

    assert.equal(await authRepository.findUserByEmail(email), null);
  });

  // Verifies an existing database row prevents duplicate registration with a normalized email.
  it("rejects registration when the normalized email already exists", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);
    await authService.registerUser(validRegistration(email));

    await assertServiceError(authService.registerUser({ ...validRegistration(email), email: ` ${email.toUpperCase()} ` }), ConflictError, 409, "EMAIL_ALREADY_USED", "An account with this email already exists.");
  });

  // Verifies missing or non-string login credentials are rejected before user lookup.
  it("rejects missing or invalid login credentials", async () => {
    const email = createTestEmail();
    const invalidCredentials = [{}, { email, password: "" }, { email: 123, password: "password123" }, { email, password: 123 }];

    for (const credentials of invalidCredentials) {
      await assertServiceError(authService.loginUser(credentials), BadRequestError, 400, "INVALID_INPUT", "Email and password are required.");
    }
  });

  // Verifies login reads the registered user from PostgreSQL and returns only public user fields.
  it("logs in with valid credentials after registration", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);
    const registeredUser = await authService.registerUser(validRegistration(email));

    const result = await authService.loginUser({ email: ` ${email.toUpperCase()} `, password: "password123" });

    assert.deepEqual(result, { id: registeredUser.id, email, firstName: "Ada", lastName: "Lovelace", role: "hiker" });
    assert.equal(Object.hasOwn(result, "password_hash"), false);
    assert.equal(Object.hasOwn(result, "salt"), false);
  });

  // Verifies nonexistent users and incorrect passwords produce the same authentication error.
  it("rejects nonexistent users and incorrect passwords", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);

    await assertServiceError(authService.loginUser({ email, password: "password123" }), UnauthorizedError, 401, "INVALID_CREDENTIALS", "Invalid email or password.");

    await authService.registerUser(validRegistration(email));

    await assertServiceError(authService.loginUser({ email, password: "incorrect-password" }), UnauthorizedError, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
  });
});