import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import authRepository from "../../../src/database/auth.repository.js";
import { BadRequestError, UnauthorizedError } from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

afterEach(() => {
  mock.reset();
});

const currentPassword = "Temporary123";
const newPassword = "Permanent456";

function mockStoredCredentials(password = currentPassword) {
  const credentials = hashPassword(password);
  const findCredentialsByIdMock = mock.method(authRepository, "findCredentialsById", async () => ({ password_hash: credentials.hash, salt: credentials.salt }));
  return { credentials, findCredentialsByIdMock };
}

async function assertServiceError(promise, ErrorType, statusCode, code, message) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  });
}

describe("changePassword_unit", () => {
  // Verifies a correct current password leads to a new hash with a new salt, guarded by the previous hash.
  it("stores a new hash and salt when the current password is correct", async () => {
    const { credentials, findCredentialsByIdMock } = mockStoredCredentials();
    const updatePasswordMock = mock.method(authRepository, "updatePassword", async () => true);

    const result = await authService.changePassword(7, { currentPassword, newPassword });
    const [id, previousHash, hash, salt] = updatePasswordMock.mock.calls[0].arguments;

    assert.equal(result, undefined);
    assert.equal(findCredentialsByIdMock.mock.calls[0].arguments[0], 7);
    assert.equal(updatePasswordMock.mock.callCount(), 1);
    assert.equal(id, 7);
    assert.equal(previousHash, credentials.hash);
    assert.notEqual(salt, credentials.salt);
    assert.notEqual(hash, credentials.hash);
    assert.equal(verifyPassword(newPassword, salt, hash), true);
    assert.equal(verifyPassword(currentPassword, salt, hash), false);
  });

  // Verifies a new password of exactly 8 characters is accepted.
  it("accepts a new password of exactly 8 characters", async () => {
    mockStoredCredentials();
    const updatePasswordMock = mock.method(authRepository, "updatePassword", async () => true);

    await authService.changePassword(7, { currentPassword, newPassword: "12345678" });

    assert.equal(updatePasswordMock.mock.callCount(), 1);
  });

  // Verifies missing, non-string, short or unchanged passwords give 400 INVALID_INPUT without touching the repository.
  it("rejects invalid current or new passwords", async () => {
    const findCredentialsByIdMock = mock.method(authRepository, "findCredentialsById");
    const updatePasswordMock = mock.method(authRepository, "updatePassword");
    const invalidBodies = [
      {},
      { newPassword },
      { currentPassword },
      { currentPassword: "", newPassword },
      { currentPassword: 12345678, newPassword },
      { currentPassword, newPassword: "1234567" },
      { currentPassword, newPassword: 123456789 },
      { currentPassword, newPassword: null },
      { currentPassword, newPassword: currentPassword },
    ];

    for (const body of invalidBodies) {
      await assertServiceError(
        authService.changePassword(7, body),
        BadRequestError, 400, "INVALID_INPUT",
        "Provide the current password and a different new password of at least 8 characters.",
      );
    }

    assert.equal(findCredentialsByIdMock.mock.callCount(), 0);
    assert.equal(updatePasswordMock.mock.callCount(), 0);
  });

  // Verifies an account that no longer has credentials gives 401 NOT_AUTHENTICATED.
  it("rejects a user whose credentials cannot be found", async () => {
    mock.method(authRepository, "findCredentialsById", async () => null);
    const updatePasswordMock = mock.method(authRepository, "updatePassword");

    await assertServiceError(authService.changePassword(7, { currentPassword, newPassword }), UnauthorizedError, 401, "NOT_AUTHENTICATED");

    assert.equal(updatePasswordMock.mock.callCount(), 0);
  });

  // Verifies a wrong current password gives 401 INVALID_CREDENTIALS and nothing is saved.
  it("rejects a wrong current password", async () => {
    mockStoredCredentials();
    const updatePasswordMock = mock.method(authRepository, "updatePassword");

    await assertServiceError(
      authService.changePassword(7, { currentPassword: "WrongPassword", newPassword }),
      UnauthorizedError, 401, "INVALID_CREDENTIALS", "Invalid current password.",
    );

    assert.equal(updatePasswordMock.mock.callCount(), 0);
  });

  // Verifies a password already changed by a concurrent request gives 401 INVALID_CREDENTIALS.
  it("rejects the change when the stored hash changed in the meantime", async () => {
    mockStoredCredentials();
    mock.method(authRepository, "updatePassword", async () => false);

    await assertServiceError(
      authService.changePassword(7, { currentPassword, newPassword }),
      UnauthorizedError, 401, "INVALID_CREDENTIALS", "Invalid current password.",
    );
  });

  // Verifies repository errors are passed on unchanged.
  it("propagates repository errors", async () => {
    const failure = new Error("database unavailable");
    mock.method(authRepository, "findCredentialsById", async () => { throw failure; });

    await assert.rejects(authService.changePassword(7, { currentPassword, newPassword }), (error) => error === failure);

    mock.reset();
    mockStoredCredentials();
    mock.method(authRepository, "updatePassword", async () => { throw failure; });

    await assert.rejects(authService.changePassword(7, { currentPassword, newPassword }), (error) => error === failure);
  });
});

describe("loginUser_unit (temporary password)", () => {
  // Verifies the login result tells the frontend whether the password must be changed.
  it("returns mustChangePassword from the stored account", async () => {
    const { hash, salt } = hashPassword(currentPassword);

    for (const mustChangePassword of [true, false]) {
      mock.method(authRepository, "findUserByEmail", async () => ({
        id: 7, email: "employee@example.com", password_hash: hash, salt, firstName: "Ada", lastName: "Lovelace", phone: null, role: "employee", mustChangePassword,
      }));

      const result = await authService.loginUser({ email: "employee@example.com", password: currentPassword });

      assert.deepEqual(result, { id: 7, email: "employee@example.com", firstName: "Ada", lastName: "Lovelace", role: "employee", mustChangePassword });
      mock.reset();
    }
  });
});

describe("getCurrentUser_unit (temporary password)", () => {
  // Verifies GET /auth/me data includes the temporary password flag.
  it("returns mustChangePassword from the stored account", async () => {
    mock.method(authRepository, "findUserById", async () => ({
      id: 7, email: "employee@example.com", firstName: "Ada", lastName: "Lovelace", phone: null,
      emergencyContactName: null, emergencyContactPhone: null, notes: null, role: "employee", mustChangePassword: true,
    }));

    const result = await authService.getCurrentUser(7);

    assert.equal(result.mustChangePassword, true);
    assert.equal(result.role, "employee");
  });
});
