import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import authRepository from "../../../src/database/auth.repository.js";
import authService from "../../../src/services/auth.service.js";
import staffService from "../../../src/services/staff.service.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

afterEach(() => mock.reset());

const input = { email: "employee@example.com", password: "Temporary123!", firstName: "Ada", lastName: "Lovelace" };

describe("employee account service failures", () => {
  it("maps a duplicate-email race to a conflict", async () => {
    mock.method(authRepository, "findUserByEmail", async () => null);
    mock.method(authRepository, "createUser", async () => {
      throw Object.assign(new Error("duplicate email"), { code: "23505" });
    });
    await assert.rejects(staffService.createEmployee(input), { statusCode: 409, code: "EMAIL_ALREADY_USED" });
  });

  it("propagates storage failures without reporting a successful creation", async () => {
    const failure = new Error("database unavailable");
    mock.method(authRepository, "findUserByEmail", async () => null);
    mock.method(authRepository, "createUser", async () => { throw failure; });
    await assert.rejects(staffService.createEmployee(input), (error) => error === failure);
  });

  it("keeps public registration restricted to hikers with permanent passwords", async () => {
    mock.method(authRepository, "findUserByEmail", async () => null);
    const create = mock.method(authRepository, "createUser", async (user) => user);
    await authService.registerUser({ ...input, role: "warden", mustChangePassword: true });
    const saved = create.mock.calls[0].arguments[0];
    assert.equal(saved.role, "hiker");
    assert.equal(saved.mustChangePassword, false);
  });
});

describe("password change service", () => {
  it("changes the salt and hash together after checking the current password", async () => {
    const original = hashPassword("Temporary123!");
    mock.method(authRepository, "findCredentialsById", async () => ({ password_hash: original.hash, salt: original.salt }));
    const update = mock.method(authRepository, "updatePassword", async () => true);
    await authService.changePassword(7, { currentPassword: "Temporary123!", newPassword: "Permanent123!" });
    const [id, previousHash, hash, salt] = update.mock.calls[0].arguments;
    assert.equal(id, 7);
    assert.equal(previousHash, original.hash);
    assert.notEqual(salt, original.salt);
    assert.equal(verifyPassword("Permanent123!", salt, hash), true);
  });

  it("rejects users removed between authentication and password lookup", async () => {
    mock.method(authRepository, "findCredentialsById", async () => null);
    const update = mock.method(authRepository, "updatePassword");
    await assert.rejects(authService.changePassword(7, { currentPassword: "Temporary123!", newPassword: "Permanent123!" }), { statusCode: 401, code: "NOT_AUTHENTICATED" });
    assert.equal(update.mock.callCount(), 0);
  });

  it("rejects a stale password when another request has already changed it", async () => {
    const { hash, salt } = hashPassword("Temporary123!");
    mock.method(authRepository, "findCredentialsById", async () => ({ password_hash: hash, salt }));
    mock.method(authRepository, "updatePassword", async () => false);
    await assert.rejects(authService.changePassword(7, { currentPassword: "Temporary123!", newPassword: "Permanent123!" }), { statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("propagates failed writes instead of reporting that the password changed", async () => {
    const { hash, salt } = hashPassword("Temporary123!");
    const failure = new Error("database unavailable");
    mock.method(authRepository, "findCredentialsById", async () => ({ password_hash: hash, salt }));
    mock.method(authRepository, "updatePassword", async () => { throw failure; });
    await assert.rejects(authService.changePassword(7, { currentPassword: "Temporary123!", newPassword: "Permanent123!" }), (error) => error === failure);
  });
});
