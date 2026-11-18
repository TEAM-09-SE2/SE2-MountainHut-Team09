import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../../../src/database/connection.js";
import authRepository from "../../../src/database/auth.repository.js";
import { BadRequestError, UnauthorizedError } from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";
import staffService from "../../../src/services/staff.service.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

const TEST_EMAIL_PATTERN = "password-repo-%@example.com";
const TEMPORARY_HIKER_LAST_NAME = "PasswordRepoTemporary";
const temporaryPassword = "Temporary123";
const newPassword = "Permanent456";

async function deleteTestUsers() {
  await pool.query("DELETE FROM app_user WHERE email LIKE $1 OR last_name = $2", [TEST_EMAIL_PATTERN, TEMPORARY_HIKER_LAST_NAME]);
}

before(deleteTestUsers);

after(async () => {
  await deleteTestUsers();
  await pool.end();
});

const createTestEmail = () => `password-repo-${randomUUID()}@example.com`;

async function createEmployee() {
  return staffService.createEmployee({ email: createTestEmail(), password: temporaryPassword, firstName: "Ada", lastName: "Lovelace" });
}

async function insertUser(role) {
  const { hash, salt } = hashPassword(temporaryPassword);
  return authRepository.createUser({ email: createTestEmail(), hash, salt, firstName: "Ada", lastName: "Lovelace", role });
}

async function findRowById(id) {
  const { rows } = await pool.query("SELECT password_hash, salt, must_change_password FROM app_user WHERE id = $1", [id]);
  return rows[0];
}

async function assertRejectsWith(promise, ErrorType, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.code, code);
    return true;
  });
}

describe("temporary password repository and service integration", () => {
  // Verifies a new employee logs in with mustChangePassword true and GET /auth/me data says the same.
  it("reports the temporary password at login and in the profile", async () => {
    const employee = await createEmployee();

    const loggedIn = await authService.loginUser({ email: employee.email, password: temporaryPassword });
    const profile = await authService.getCurrentUser(employee.id);

    assert.equal(loggedIn.mustChangePassword, true);
    assert.equal(profile.mustChangePassword, true);
  });
});

describe("changePassword repository and service integration", () => {
  // Verifies a successful change saves a new hash and salt, clears the flag and only the new password works.
  it("replaces the temporary password and clears the flag", async () => {
    const employee = await createEmployee();
    const original = await findRowById(employee.id);

    await authService.changePassword(employee.id, { currentPassword: temporaryPassword, newPassword });
    const afterChange = await findRowById(employee.id);

    assert.equal(afterChange.must_change_password, false);
    assert.notEqual(afterChange.salt, original.salt);
    assert.notEqual(afterChange.password_hash, original.password_hash);
    assert.equal(verifyPassword(newPassword, afterChange.salt, afterChange.password_hash), true);
    assert.equal((await authService.loginUser({ email: employee.email, password: newPassword })).mustChangePassword, false);
    await assertRejectsWith(authService.loginUser({ email: employee.email, password: temporaryPassword }), UnauthorizedError, "INVALID_CREDENTIALS");
  });

  // Verifies hikers and wardens with a permanent password can change it too.
  it("lets users with a permanent password change it", async () => {
    for (const role of ["hiker", "warden"]) {
      const user = await insertUser(role);

      await authService.changePassword(user.id, { currentPassword: temporaryPassword, newPassword });
      const row = await findRowById(user.id);

      assert.equal(row.must_change_password, false);
      assert.equal(verifyPassword(newPassword, row.salt, row.password_hash), true);
    }
  });

  // Verifies a wrong current password or invalid new password leaves the stored row unchanged.
  it("leaves the row unchanged when the change is rejected", async () => {
    const employee = await createEmployee();
    const original = await findRowById(employee.id);

    await assertRejectsWith(authService.changePassword(employee.id, { currentPassword: "WrongPassword", newPassword }), UnauthorizedError, "INVALID_CREDENTIALS");
    await assertRejectsWith(authService.changePassword(employee.id, { currentPassword: temporaryPassword, newPassword: "short" }), BadRequestError, "INVALID_INPUT");
    await assertRejectsWith(authService.changePassword(employee.id, { currentPassword: temporaryPassword, newPassword: temporaryPassword }), BadRequestError, "INVALID_INPUT");

    assert.deepEqual(await findRowById(employee.id), original);
  });

  // Verifies unknown ids and temporary hikers (no password) get 401 NOT_AUTHENTICATED.
  it("rejects accounts that have no credentials", async () => {
    const { rows: [temporaryHiker] } = await pool.query(
      "INSERT INTO app_user (first_name, last_name, is_temporary) VALUES ('Temp', $1, true) RETURNING id",
      [TEMPORARY_HIKER_LAST_NAME],
    );
    const { rows: [{ max }] } = await pool.query("SELECT COALESCE(MAX(id), 0) + 1000 AS max FROM app_user");

    for (const id of [temporaryHiker.id, max]) {
      await assertRejectsWith(authService.changePassword(id, { currentPassword: temporaryPassword, newPassword }), UnauthorizedError, "NOT_AUTHENTICATED");
    }
  });

  // Verifies two concurrent changes with the same current password: only one wins and its password is stored.
  it("accepts only one of two concurrent changes", async () => {
    const employee = await createEmployee();
    const candidates = ["FirstPassword1", "SecondPassword2"];

    const results = await Promise.allSettled(candidates.map((candidate) => authService.changePassword(employee.id, { currentPassword: temporaryPassword, newPassword: candidate })));
    const winner = results.findIndex((result) => result.status === "fulfilled");
    const loser = results.find((result) => result.status === "rejected");
    const row = await findRowById(employee.id);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(loser.reason.code, "INVALID_CREDENTIALS");
    assert.equal(verifyPassword(candidates[winner], row.salt, row.password_hash), true);
    assert.equal(row.must_change_password, false);
  });
});

describe("updatePassword repository", () => {
  // Verifies the update is refused when the previous hash does not match the stored one.
  it("does not update when the previous hash is stale", async () => {
    const employee = await createEmployee();
    const original = await findRowById(employee.id);
    const { hash, salt } = hashPassword(newPassword);

    const updated = await authRepository.updatePassword(employee.id, "0".repeat(64), hash, salt);

    assert.equal(updated, false);
    assert.deepEqual(await findRowById(employee.id), original);
  });
});
