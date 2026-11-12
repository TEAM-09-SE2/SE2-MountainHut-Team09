import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import authRepository from "../../../src/database/auth.repository.js";
import {BadRequestError,ConflictError, UnauthorizedError} from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

afterEach(() => {
  mock.reset();
});

const validRegistration = () => ({
  email: "hiker@example.com",
  password: "password123",
  firstName: "Ada",
  lastName: "Lovelace",
});

async function assertServiceError(promise, ErrorType, statusCode, code, message) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  });
}

describe("registerUser_unit", () => {
  // Verifies successful registration normalizes user fields and stores a verifiable password hash.
  it("registers a user with normalized fields and a hashed password", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);
    const createUserMock = mock.method(authRepository, "createUser", async (user) => ({ id: 7, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role }));

    const result = await authService.registerUser({ ...validRegistration(), email: "  HIKER@Example.com ", firstName: " Ada ", lastName: " Lovelace ", phone: " 1234567890 " });
    const createdUser = createUserMock.mock.calls[0].arguments[0];

    assert.deepEqual(result, { id: 7, email: "hiker@example.com", firstName: "Ada", lastName: "Lovelace", phone: "1234567890", role: "hiker" });
    assert.equal(findUserByEmailMock.mock.calls[0].arguments[0], "hiker@example.com");
    assert.equal(findUserByEmailMock.mock.callCount(), 1);
    assert.equal(createUserMock.mock.callCount(), 1);
    assert.equal(verifyPassword("password123", createdUser.salt, createdUser.hash), true);
    assert.equal(createdUser.role, "hiker");
  });

  // Verifies missing, non-string, or malformed emails produce INVALID_INPUT without querying the repository.
  it("rejects missing, non-string, and malformed email addresses", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);
    const invalidEmails = [undefined, null, "", 42, "not-an-email", "name @example.com", "name@example"];

    for (const email of invalidEmails) {
      await assertServiceError(authService.registerUser({ ...validRegistration(), email }), BadRequestError, 400, "INVALID_INPUT", "Invalid email format.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies missing, non-string, or fewer-than-8-character passwords produce INVALID_INPUT.
  it("rejects missing, non-string, and short passwords", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);
    const invalidPasswords = [undefined, null, "", 12345678, "short7"];

    for (const password of invalidPasswords) {
      await assertServiceError(authService.registerUser({ ...validRegistration(), password }), BadRequestError, 400, "INVALID_INPUT", "Password must be at least 8 characters long.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies missing, non-string, or whitespace-only first names produce INVALID_INPUT.
  it("rejects missing or blank first names", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);

    for (const firstName of [undefined, null, "", "   ", 42]) {
      await assertServiceError(authService.registerUser({ ...validRegistration(), firstName }), BadRequestError, 400, "INVALID_INPUT", "First name is required.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies missing, non-string, or whitespace-only last names produce INVALID_INPUT.
  it("rejects missing or blank last names", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);

    for (const lastName of [undefined, null, "", "   ", 42]) {
      await assertServiceError(authService.registerUser({ ...validRegistration(), lastName }), BadRequestError, 400, "INVALID_INPUT", "Last name is required.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies non-numeric or longer-than-10-digit phone numbers produce INVALID_INPUT.
  it("rejects phone numbers with non-digits or more than 10 digits", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);

    for (const phone of ["12345678901", "123-456", "phone"]) {
      await assertServiceError(authService.registerUser({ ...validRegistration(), phone }), BadRequestError, 400, "INVALID_INPUT", "Phone number must contain only digits and be at most 10 characters long.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies an existing normalized email produces EMAIL_ALREADY_USED without creating the user.
  it("rejects when the normalized email already belongs to an account", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => ({ id: 1 }));
    const createUserMock = mock.method(authRepository, "createUser");

    await assertServiceError(authService.registerUser({ ...validRegistration(), email: "  HIKER@Example.com " }), ConflictError, 409, "EMAIL_ALREADY_USED", "An account with this email already exists.");

    assert.equal(findUserByEmailMock.mock.calls[0].arguments[0], "hiker@example.com");
    assert.equal(createUserMock.mock.callCount(), 0);
  });

  // Verifies database unique-constraint errors are converted to EMAIL_ALREADY_USED.
  it("converts database unique-constraint errors to an email conflict", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);
    const errors = [Object.assign(new Error("constraint"), { code: "SQLITE_CONSTRAINT" }), Object.assign(new Error("duplicate"), { code: "23505" }), new Error("UNIQUE constraint failed")];
    let repositoryError;
    const createUserMock = mock.method(authRepository, "createUser", async () => {
      throw repositoryError;
    });

    for (const error of errors) {
      repositoryError = error;
      await assertServiceError(authService.registerUser(validRegistration()), ConflictError, 409, "EMAIL_ALREADY_USED", "An account with this email already exists.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), errors.length);
    assert.equal(createUserMock.mock.callCount(), errors.length);
  });

  // Verifies unrelated repository errors are propagated unchanged.
  it("propagates unrelated repository errors unchanged", async () => {
    const repositoryError = new Error("database unavailable");
    mock.method(authRepository, "findUserByEmail", async () => null);
    mock.method(authRepository, "createUser", async () => {
      throw repositoryError;
    });

    await assert.rejects(authService.registerUser(validRegistration()), (error) => error === repositoryError);
  });
});

describe("loginUser_unit", () => {
  // Verifies valid credentials return the public user fields without password data.
  it("logs in with valid credentials and returns the public user fields", async () => {
    const { hash, salt } = hashPassword("password123");
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => ({ id: 7, email: "hiker@example.com", firstName: "Ada", lastName: "Lovelace", role: "hiker", salt, password_hash: hash }));

    const result = await authService.loginUser({ email: "  HIKER@Example.com ", password: "password123" });

    assert.deepEqual(result, { id: 7, email: "hiker@example.com", firstName: "Ada", lastName: "Lovelace", role: "hiker" });
    assert.equal(findUserByEmailMock.mock.calls[0].arguments[0], "hiker@example.com");
    assert.equal(findUserByEmailMock.mock.callCount(), 1);
    assert.equal(Object.hasOwn(result, "salt"), false);
    assert.equal(Object.hasOwn(result, "password_hash"), false);
  });

  // Verifies missing or non-string credentials produce INVALID_INPUT without looking up the user.
  it("rejects missing or non-string credentials", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);

    for (const credentials of [{}, { email: "", password: "password123" }, { email: "hiker@example.com", password: "" }, { email: 123, password: "password123" }, { email: "hiker@example.com", password: 123 }]) {
      await assertServiceError(authService.loginUser(credentials), BadRequestError, 400, "INVALID_INPUT", "Email and password are required.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies an email with no matching account produces INVALID_CREDENTIALS.
  it("rejects when no account matches the normalized email", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);

    await assertServiceError(authService.loginUser({ email: "  HIKER@Example.com ", password: "password123" }), UnauthorizedError, 401, "INVALID_CREDENTIALS", "Invalid email or password.");

    assert.equal(findUserByEmailMock.mock.calls[0].arguments[0], "hiker@example.com");
  });

  // Verifies an incorrect password produces INVALID_CREDENTIALS even when the account exists.
  it("rejects when the password does not match the stored hash", async () => {
    const { hash, salt } = hashPassword("correct-password");
    mock.method(authRepository, "findUserByEmail", async () => ({id: 1, email: "hiker@example.com", firstName: "Ada", lastName: "Lovelace", role: "hiker", salt, password_hash: hash,}));

    await assertServiceError(authService.loginUser({ email: "hiker@example.com", password: "incorrect-password" }), UnauthorizedError, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
  });

  // Verifies errors during user lookup are propagated unchanged.
  it("propagates repository lookup errors unchanged", async () => {
    const repositoryError = new Error("database unavailable");
    mock.method(authRepository, "findUserByEmail", async () => {
      throw repositoryError;
    });

    await assert.rejects(authService.loginUser({email: "hiker@example.com", password: "password123"}), (error) => error === repositoryError);
  });
});