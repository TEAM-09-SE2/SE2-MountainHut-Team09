import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import authRepository from "../../src/database/auth.repository.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = "password-e2e-test-secret";
const TEST_EMAIL_PATTERN = "password-e2e-%@example.com";
const SLOT_START = "2094-03-14T12:00:00+01:00";
const SLOT_END = "2094-03-14T13:00:00+01:00";
const wardenPassword = "WardenPassword1";
const temporaryPassword = "Temporary123";
const newPassword = "Permanent456";
const server = app.listen(0, "127.0.0.1");
let baseUrl;
let warden;
let wardenCookie;

async function deleteTestData() {
  await pool.query("DELETE FROM slot_table WHERE slot_id IN (SELECT id FROM slot WHERE start_at >= '2094-01-01' AND start_at < '2095-01-01')");
  await pool.query("DELETE FROM slot WHERE start_at >= '2094-01-01' AND start_at < '2095-01-01'");
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_PATTERN]);
}

const createTestEmail = () => `password-e2e-${randomUUID()}@example.com`;

async function sendRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: text ? JSON.parse(text) : null };
}

async function login(email, password) {
  const response = await sendRequest("/auth/login", { method: "POST", body: { email, password } });
  assert.equal(response.status, 200);
  return { user: response.body, cookie: response.headers.get("set-cookie").split(";")[0] };
}

function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.body.error, code);
}

async function createEmployee() {
  const email = createTestEmail();
  const response = await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: { email, password: temporaryPassword, firstName: "Ada", lastName: "Lovelace" } });
  assert.equal(response.status, 201);
  return response.body;
}

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = "test";
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  await deleteTestData();
  const { hash, salt } = hashPassword(wardenPassword);
  warden = await authRepository.createUser({ email: createTestEmail(), hash, salt, firstName: "Marco", lastName: "Warden", role: "warden" });
  wardenCookie = (await login(warden.email, wardenPassword)).cookie;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await deleteTestData();
  await pool.end();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("first login with a temporary password end-to-end", () => {
  // Verifies a new employee is blocked until the temporary password is changed, then can work with the same session.
  it("forces the employee to change the temporary password before using the application", async () => {
    const employee = await createEmployee();
    const { user, cookie } = await login(employee.email, temporaryPassword);
    const slot = { startAt: SLOT_START, endAt: SLOT_END, tables: [{ tableNumber: 1, seats: 4 }] };

    const meBefore = await sendRequest("/auth/me", { cookie });
    const blockedSlot = await sendRequest("/slots", { method: "POST", cookie, body: slot });
    const change = await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword } });
    const meAfter = await sendRequest("/auth/me", { cookie });
    const createdSlot = await sendRequest("/slots", { method: "POST", cookie, body: slot });

    assert.equal(user.mustChangePassword, true);
    assert.equal(meBefore.status, 200);
    assert.equal(meBefore.body.mustChangePassword, true);
    assertError(blockedSlot, 403, "PASSWORD_CHANGE_REQUIRED");
    assert.equal(change.status, 204);
    assert.equal(change.text, "");
    assert.equal(meAfter.body.mustChangePassword, false);
    assert.equal(createdSlot.status, 201);
    assert.equal(createdSlot.body.totalSeats, 4);
  });

  // Verifies logging out and in again does not skip the password change.
  it("keeps asking for the change after logout and a new login", async () => {
    const employee = await createEmployee();
    const firstSession = await login(employee.email, temporaryPassword);

    const logout = await sendRequest("/auth/logout", { method: "POST", cookie: firstSession.cookie });
    const secondSession = await login(employee.email, temporaryPassword);

    assert.equal(logout.status, 204);
    assert.equal(secondSession.user.mustChangePassword, true);
    assertError(await sendRequest("/slots/1", { cookie: secondSession.cookie }), 403, "PASSWORD_CHANGE_REQUIRED");
  });

  // Verifies after the change only the new password works and the warden sees the employee as done.
  it("replaces the temporary password for later logins and in the warden's list", async () => {
    const employee = await createEmployee();
    const { cookie } = await login(employee.email, temporaryPassword);

    await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword } });
    const oldLogin = await sendRequest("/auth/login", { method: "POST", body: { email: employee.email, password: temporaryPassword } });
    const newLogin = await login(employee.email, newPassword);
    const listed = (await sendRequest("/staff/employees", { cookie: wardenCookie })).body.find((user) => user.id === employee.id);

    assertError(oldLogin, 401, "INVALID_CREDENTIALS");
    assert.equal(newLogin.user.mustChangePassword, false);
    assert.equal(listed.mustChangePassword, false);
  });

  // Verifies a wrong current password or an invalid new password keeps the temporary password and the block.
  it("keeps the temporary password when the change is rejected", async () => {
    const employee = await createEmployee();
    const { cookie } = await login(employee.email, temporaryPassword);

    assertError(await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: "WrongPassword", newPassword } }), 401, "INVALID_CREDENTIALS");
    assertError(await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword: "short" } }), 400, "INVALID_INPUT");
    assertError(await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword: temporaryPassword } }), 400, "INVALID_INPUT");

    assert.equal((await login(employee.email, temporaryPassword)).user.mustChangePassword, true);
    assertError(await sendRequest("/slots/1", { cookie }), 403, "PASSWORD_CHANGE_REQUIRED");
  });
});

describe("own password change end-to-end", () => {
  // Verifies a hiker who registered on the web can change their own password.
  it("lets a hiker change their own password", async () => {
    const email = createTestEmail();
    await sendRequest("/auth/register", { method: "POST", body: { email, password: "HikerPassword1", firstName: "Hugo", lastName: "Hiker" } });
    const { cookie } = await login(email, "HikerPassword1");

    const change = await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: "HikerPassword1", newPassword } });

    assert.equal(change.status, 204);
    assert.equal((await login(email, newPassword)).user.mustChangePassword, false);
    assertError(await sendRequest("/auth/login", { method: "POST", body: { email, password: "HikerPassword1" } }), 401, "INVALID_CREDENTIALS");
  });

  // Verifies the warden can change their own password and keeps access to the staff APIs.
  it("lets the warden change their own password", async () => {
    const { hash, salt } = hashPassword(wardenPassword);
    const otherWarden = await authRepository.createUser({ email: createTestEmail(), hash, salt, firstName: "Maria", lastName: "Warden", role: "warden" });
    const { cookie } = await login(otherWarden.email, wardenPassword);

    const change = await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: wardenPassword, newPassword } });
    const newSession = await login(otherWarden.email, newPassword);

    assert.equal(change.status, 204);
    assert.equal((await sendRequest("/staff/employees", { cookie: newSession.cookie })).status, 200);
  });

  // Verifies the password API needs a login.
  it("rejects a password change without a session", async () => {
    assertError(await sendRequest("/auth/password", { method: "PUT", body: { currentPassword: temporaryPassword, newPassword } }), 401, "NOT_AUTHENTICATED");
  });
});
