import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import authRepository from "../../../src/database/auth.repository.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "password-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
const temporaryPassword = "Temporary123";
const newPassword = "Permanent456";
let baseUrl;
let storedUsers;

const TEMPORARY_EMPLOYEE_ID = 1;
const WARDEN_ID = 2;
const HIKER_ID = 3;

function seedUsers() {
  storedUsers = new Map();
  for (const [id, role, mustChangePassword] of [[TEMPORARY_EMPLOYEE_ID, "employee", true], [WARDEN_ID, "warden", false], [HIKER_ID, "hiker", false]]) {
    const { hash, salt } = hashPassword(temporaryPassword);
    storedUsers.set(id, { id, email: `${role}${id}@example.com`, firstName: "Test", lastName: role, phone: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, role, mustChangePassword, password_hash: hash, salt });
  }
}

function mockRepository() {
  mock.method(authRepository, "findUserById", async (id) => {
    const user = storedUsers.get(id);
    if (!user) return null;
    const { password_hash, salt, ...profile } = user;
    return profile;
  });
  mock.method(authRepository, "findUserByEmail", async (email) => [...storedUsers.values()].find((user) => user.email === email) ?? null);
  const findCredentialsByIdMock = mock.method(authRepository, "findCredentialsById", async (id) => {
    const user = storedUsers.get(id);
    return user ? { password_hash: user.password_hash, salt: user.salt } : null;
  });
  const updatePasswordMock = mock.method(authRepository, "updatePassword", async (id, previousHash, hash, salt) => {
    const user = storedUsers.get(id);
    if (!user || user.password_hash !== previousHash) return false;
    Object.assign(user, { password_hash: hash, salt, mustChangePassword: false });
    return true;
  });
  return { findCredentialsByIdMock, updatePasswordMock };
}

const cookieFor = (id) => `token=${jwt.sign({ id, role: storedUsers.get(id)?.role ?? "hiker" }, testJwtSecret)}`;

async function sendRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: text ? JSON.parse(text) : null };
}

function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.body.error, code);
}

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

beforeEach(() => {
  seedUsers();
  mock.method(console, "error", () => {});
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe("PUT /api/v1/auth/password service and controller integration", () => {
  // Verifies a correct change answers 204 with no body, saves a new hash and clears the flag.
  it("changes the password and clears the temporary password flag", async () => {
    const { updatePasswordMock } = mockRepository();
    const previousHash = storedUsers.get(TEMPORARY_EMPLOYEE_ID).password_hash;

    const response = await sendRequest("/auth/password", { method: "PUT", cookie: cookieFor(TEMPORARY_EMPLOYEE_ID), body: { currentPassword: temporaryPassword, newPassword } });
    const [id, oldHash] = updatePasswordMock.mock.calls[0].arguments;
    const stored = storedUsers.get(TEMPORARY_EMPLOYEE_ID);

    assert.equal(response.status, 204);
    assert.equal(response.text, "");
    assert.equal(id, TEMPORARY_EMPLOYEE_ID);
    assert.equal(oldHash, previousHash);
    assert.equal(stored.mustChangePassword, false);
    assert.equal(verifyPassword(newPassword, stored.salt, stored.password_hash), true);
  });

  // Verifies every role can change its own password, and an id in the body cannot target another account.
  it("lets every role change only their own password", async () => {
    const { updatePasswordMock } = mockRepository();

    for (const id of [WARDEN_ID, HIKER_ID]) {
      const response = await sendRequest("/auth/password", { method: "PUT", cookie: cookieFor(id), body: { currentPassword: temporaryPassword, newPassword, id: TEMPORARY_EMPLOYEE_ID } });
      assert.equal(response.status, 204);
    }

    assert.deepEqual(updatePasswordMock.mock.calls.map((call) => call.arguments[0]), [WARDEN_ID, HIKER_ID]);
    assert.equal(storedUsers.get(TEMPORARY_EMPLOYEE_ID).mustChangePassword, true);
  });

  // Verifies missing, short, non-string or unchanged passwords give 400 INVALID_INPUT and nothing is saved.
  it("rejects invalid bodies with 400 INVALID_INPUT", async () => {
    const { updatePasswordMock } = mockRepository();
    const invalidBodies = [
      {},
      [],
      { newPassword },
      { currentPassword: temporaryPassword },
      { currentPassword: temporaryPassword, newPassword: "short" },
      { currentPassword: temporaryPassword, newPassword: 12345678 },
      { currentPassword: temporaryPassword, newPassword: temporaryPassword },
    ];

    for (const body of invalidBodies) {
      assertError(await sendRequest("/auth/password", { method: "PUT", cookie: cookieFor(TEMPORARY_EMPLOYEE_ID), body }), 400, "INVALID_INPUT");
    }

    assert.equal(updatePasswordMock.mock.callCount(), 0);
  });

  // Verifies a wrong current password gives 401 INVALID_CREDENTIALS and keeps the flag set.
  it("rejects a wrong current password with 401 INVALID_CREDENTIALS", async () => {
    const { updatePasswordMock } = mockRepository();

    const response = await sendRequest("/auth/password", { method: "PUT", cookie: cookieFor(TEMPORARY_EMPLOYEE_ID), body: { currentPassword: "WrongPassword", newPassword } });

    assertError(response, 401, "INVALID_CREDENTIALS");
    assert.equal(updatePasswordMock.mock.callCount(), 0);
    assert.equal(storedUsers.get(TEMPORARY_EMPLOYEE_ID).mustChangePassword, true);
  });

  // Verifies requests without a valid session get 401 NOT_AUTHENTICATED.
  it("rejects requests without a valid session", async () => {
    const { findCredentialsByIdMock } = mockRepository();

    for (const cookie of [undefined, "token=invalid", `token=${jwt.sign({ id: 999, role: "hiker" }, testJwtSecret)}`]) {
      assertError(await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword } }), 401, "NOT_AUTHENTICATED");
    }

    assert.equal(findCredentialsByIdMock.mock.callCount(), 0);
  });
});

describe("temporary password gate service and controller integration", () => {
  // Verifies login reports mustChangePassword so the frontend can send the user to the password page.
  it("returns mustChangePassword in the login response", async () => {
    mockRepository();

    const response = await sendRequest("/auth/login", { method: "POST", body: { email: "employee1@example.com", password: temporaryPassword } });

    assert.equal(response.status, 200);
    assert.equal(response.body.mustChangePassword, true);
    assert.match(response.headers.get("set-cookie"), /^token=/);
  });

  // Verifies profile, logout and password change stay available while the temporary password is active.
  it("allows /auth/me, /auth/logout and /auth/password with a temporary password", async () => {
    mockRepository();
    const cookie = cookieFor(TEMPORARY_EMPLOYEE_ID);

    const me = await sendRequest("/auth/me", { cookie });
    const logout = await sendRequest("/auth/logout", { method: "POST", cookie });

    assert.equal(me.status, 200);
    assert.equal(me.body.mustChangePassword, true);
    assert.equal(logout.status, 204);
    assert.equal((await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword } })).status, 204);
  });

  // Verifies every other protected API answers 403 PASSWORD_CHANGE_REQUIRED until the password is changed.
  it("blocks other protected APIs until the password is changed, then lets them through", async () => {
    mockRepository();
    const cookie = cookieFor(TEMPORARY_EMPLOYEE_ID);
    const protectedRequests = [
      ["/slots", "POST", {}],
      ["/slots/invalid", "GET"],
      ["/staff/employees", "GET"],
      ["/staff/employees", "POST", {}],
      ["/reservations", "POST", {}],
      ["/me/reservations", "GET"],
      ["/reservations/1", "PATCH", {}],
    ];

    for (const [path, method, body] of protectedRequests) {
      assertError(await sendRequest(path, { method, cookie, body }), 403, "PASSWORD_CHANGE_REQUIRED");
    }

    assert.equal((await sendRequest("/auth/password", { method: "PUT", cookie, body: { currentPassword: temporaryPassword, newPassword } })).status, 204);
    assertError(await sendRequest("/slots/invalid", { cookie }), 400, "INVALID_INPUT");
    assertError(await sendRequest("/staff/employees", { cookie }), 403, "FORBIDDEN_ROLE");
    assertError(await sendRequest("/me/reservations", { cookie }), 403, "FORBIDDEN_ROLE");
  });
});
