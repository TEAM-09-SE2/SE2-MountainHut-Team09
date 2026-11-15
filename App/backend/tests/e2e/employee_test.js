import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import authRepository from "../../src/database/auth.repository.js";
import { hashPassword, verifyPassword } from "../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const secret = "employee-api-e2e-secret";
const password = "Temporary123!";
let server;
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = "test";
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  await pool.end();
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function accountInput(t, fields = {}) {
  const email = `employee-api-${randomUUID()}@example.com`;
  t.after(() => pool.query("DELETE FROM app_user WHERE email = $1", [email]));
  return { email, password, firstName: "Ada", lastName: "Lovelace", ...fields };
}

async function createUser(t, role, mustChangePassword = false) {
  const input = accountInput(t);
  const { hash, salt } = hashPassword(password);
  return authRepository.createUser({ ...input, hash, salt, role, mustChangePassword });
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return fetch(`${baseUrl}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(user, userPassword = password) {
  const response = await request("/auth/login", {
    method: "POST", body: { email: user.email, password: userPassword },
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  return { cookie, user: await response.json() };
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).error, code);
}

describe("employee account APIs end-to-end", () => {
  it("creates an employee, enforces the first password change and unlocks the existing session", async (t) => {
    const warden = await createUser(t, "warden");
    const { cookie: wardenCookie } = await login(warden);
    const input = accountInput(t);
    const created = await request("/staff/employees", {
      method: "POST", cookie: wardenCookie,
      body: { ...input, email: ` ${input.email.toUpperCase()} `, firstName: " Ada ", phone: " 1234567890 ", role: "warden", mustChangePassword: false },
    });
    assert.equal(created.status, 201);
    const employee = await created.json();
    assert.deepEqual(employee, {
      id: employee.id, email: input.email, firstName: "Ada", lastName: "Lovelace",
      phone: "1234567890", role: "employee", mustChangePassword: true,
    });
    const stored = await authRepository.findUserByEmail(input.email);
    assert.equal(verifyPassword(password, stored.salt, stored.password_hash), true);
    const profile = await authRepository.findUserById(employee.id);
    for (const field of ["emergencyContactName", "emergencyContactPhone", "notes"]) {
      assert.equal(profile[field], null);
    }

    const { cookie, user } = await login(employee);
    assert.equal(user.mustChangePassword, true);
    const me = await request("/auth/me", { cookie });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).mustChangePassword, true);
    for (const [path, method] of [["/slots/1", "GET"], ["/slots", "POST"], ["/staff/employees", "GET"], ["/staff/employees", "POST"]]) {
      await expectError(await request(path, { cookie, method, body: method === "POST" ? {} : undefined }), 403, "PASSWORD_CHANGE_REQUIRED");
    }
    const logout = await request("/auth/logout", { method: "POST", cookie });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie"), /token=;/);

    const change = await request("/auth/password", {
      method: "PUT", cookie, body: { currentPassword: password, newPassword: "Permanent123!" },
    });
    assert.equal(change.status, 204);
    assert.equal(await change.text(), "");
    const updated = await authRepository.findUserByEmail(input.email);
    assert.equal(updated.mustChangePassword, false);
    assert.notEqual(updated.salt, stored.salt);
    assert.notEqual(updated.password_hash, stored.password_hash);
    assert.equal(verifyPassword("Permanent123!", updated.salt, updated.password_hash), true);
    assert.equal((await (await request("/auth/me", { cookie })).json()).mustChangePassword, false);
    // An invalid slot reaches the controller once the password gate has been cleared.
    await expectError(await request("/slots/invalid", { cookie }), 400, "INVALID_INPUT");
    await expectError(await request("/staff/employees", { cookie }), 403, "FORBIDDEN_ROLE");
    await expectError(await request("/auth/login", { method: "POST", body: { email: input.email, password } }), 401, "INVALID_CREDENTIALS");
    assert.equal((await login(employee, "Permanent123!")).user.mustChangePassword, false);
  });

  it("allows only wardens to create and list employees", async (t) => {
    for (const role of [null, "hiker", "employee"]) {
      const cookie = role ? (await login(await createUser(t, role))).cookie : undefined;
      const status = role ? 403 : 401;
      const code = role ? "FORBIDDEN_ROLE" : "NOT_AUTHENTICATED";
      for (const method of ["GET", "POST"]) {
        await expectError(await request("/staff/employees", { cookie, method, body: method === "POST" ? accountInput(t) : undefined }), status, code);
      }
    }
  });

  it("lists only employees with safe fields in last-name and first-name order", async (t) => {
    const warden = await createUser(t, "warden");
    const hiker = await createUser(t, "hiker");
    const { cookie } = await login(warden);
    const employees = [];
    for (const [firstName, lastName] of [["Zoe", "Zebra"], ["Zoe", "Alfa"], ["Ada", "Alfa"]]) {
      const response = await request("/staff/employees", { method: "POST", cookie, body: accountInput(t, { firstName, lastName }) });
      assert.equal(response.status, 201);
      employees.push(await response.json());
    }
    const response = await request("/staff/employees", { cookie });
    assert.equal(response.status, 200);
    const list = await response.json();
    assert.ok(list.every((user) => user.id !== warden.id && user.id !== hiker.id));
    const selected = list.filter((user) => employees.some((employee) => employee.id === user.id));
    assert.deepEqual(selected.map((user) => user.id), [employees[2].id, employees[1].id, employees[0].id]);
    for (const user of selected) {
      assert.deepEqual(Object.keys(user).sort(), ["id", "email", "firstName", "lastName", "phone", "mustChangePassword", "createdAt"].sort());
      assert.equal(user.mustChangePassword, true);
      assert.ok(Number.isFinite(Date.parse(user.createdAt)));
    }
  });

  it("validates employee fields and detects duplicate emails across all roles", async (t) => {
    const { cookie } = await login(await createUser(t, "warden"));
    const input = accountInput(t);
    const invalid = [
      undefined, {}, [], [input],
      ...[{ email: "invalid" }, { email: 42 }, { email: `${"a".repeat(250)}@example.com` },
        { password: "short" }, { password: 12345678 }, { firstName: " " }, { lastName: null },
        { firstName: "a".repeat(101) }, { lastName: "a".repeat(101) },
        { phone: "12345678901" }, { phone: "123-456" }, { phone: 42 },
        ...["emergencyContactName", "emergencyContactPhone", "notes"].flatMap((field) =>
          [null, "", "value"].map((value) => ({ [field]: value }))),
      ].map((fields) => ({ ...input, ...fields })),
    ];
    for (const body of invalid) {
      await expectError(await request("/staff/employees", { method: "POST", cookie, body }), 400, "INVALID_INPUT");
    }
    assert.equal(await authRepository.findUserByEmail(input.email), null);
    for (const role of ["hiker", "employee", "warden"]) {
      const existing = await createUser(t, role);
      await expectError(await request("/staff/employees", {
        method: "POST", cookie, body: { ...input, email: ` ${existing.email.toUpperCase()} ` },
      }), 409, "EMAIL_ALREADY_USED");
    }
  });

  for (const role of ["hiker", "employee", "warden"]) {
    it(`lets a ${role} change only their own password and preserves state on invalid requests`, async (t) => {
      const account = await createUser(t, role, true);
      const other = await createUser(t, role);
      const { cookie } = await login(account);
      const original = await authRepository.findUserByEmail(account.email);
      for (const body of [undefined, {}, [], { newPassword: "NewPassword123!" },
        { currentPassword: password, newPassword: "short" },
        { currentPassword: password, newPassword: password },
        { currentPassword: 12345678, newPassword: "NewPassword123!" },
        { currentPassword: password, newPassword: 12345678 }]) {
        await expectError(await request("/auth/password", { method: "PUT", cookie, body }), 400, "INVALID_INPUT");
      }
      await expectError(await request("/auth/password", { method: "PUT", cookie, body: { currentPassword: "WrongPassword!", newPassword: "NewPassword123!" } }), 401, "INVALID_CREDENTIALS");
      assert.deepEqual(await authRepository.findUserByEmail(account.email), original);
      const change = await request("/auth/password", { method: "PUT", cookie, body: {
        currentPassword: password, newPassword: "NewPassword123!", id: other.id,
      } });
      assert.equal(change.status, 204);
      assert.equal((await login(account, "NewPassword123!")).user.mustChangePassword, false);
      assert.equal((await login(other)).user.mustChangePassword, false);
      // A regular account can subsequently change its password again.
      assert.equal((await request("/auth/password", { method: "PUT", cookie, body: { currentPassword: "NewPassword123!", newPassword: "ThirdPassword123!" } })).status, 204);
    });
  }

  it("blocks all hiker reservation routes while a temporary password is active", async (t) => {
    const account = await createUser(t, "hiker");
    const { cookie } = await login(account);
    // The same token must observe a password flag changed after login.
    await pool.query("UPDATE app_user SET must_change_password = true WHERE id = $1", [account.id]);
    for (const [path, method] of [["/reservations", "POST"], ["/me/reservations", "GET"], ["/reservations/1", "PATCH"]]) {
      await expectError(await request(path, { cookie, method, body: method === "GET" ? undefined : {} }), 403, "PASSWORD_CHANGE_REQUIRED");
    }
  });

  it("rejects unauthenticated, expired, malformed and deleted-user sessions", async (t) => {
    const deleted = await createUser(t, "warden");
    const { cookie: deletedCookie } = await login(deleted);
    await pool.query("DELETE FROM app_user WHERE id = $1", [deleted.id]);
    const cookies = [undefined, "token=invalid", deletedCookie,
      `token=${jwt.sign({ id: deleted.id }, secret, { expiresIn: -1 })}`,
      `token=${jwt.sign({ id: "invalid" }, secret)}`,
      `token=${jwt.sign({ id: deleted.id }, "wrong-secret")}`,
    ];
    for (const cookie of cookies) {
      for (const [path, method] of [["/staff/employees", "GET"], ["/auth/me", "GET"], ["/auth/password", "PUT"]]) {
        await expectError(await request(path, { method, cookie }), 401, "NOT_AUTHENTICATED");
      }
    }
  });

  it("uses the current database role rather than stale role claims", async (t) => {
    const warden = await createUser(t, "warden");
    const { cookie } = await login(warden);
    await pool.query("UPDATE app_user SET role = 'hiker' WHERE id = $1", [warden.id]);
    await expectError(await request("/staff/employees", { cookie }), 403, "FORBIDDEN_ROLE");
  });

  it("creates only one account for concurrent requests with the same email", async (t) => {
    const { cookie } = await login(await createUser(t, "warden"));
    const body = accountInput(t);
    const responses = await Promise.all([
      request("/staff/employees", { method: "POST", cookie, body }),
      request("/staff/employees", { method: "POST", cookie, body }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    await expectError(responses.find((response) => response.status === 409), 409, "EMAIL_ALREADY_USED");
    const { rows } = await pool.query("SELECT count(*)::int AS count FROM app_user WHERE email = $1", [body.email]);
    assert.equal(rows[0].count, 1);
  });

  it("accepts only one concurrent password change using the same current password", async (t) => {
    const account = await createUser(t, "employee", true);
    const { cookie } = await login(account);
    const candidates = ["FirstPassword123!", "SecondPassword123!"];
    const responses = await Promise.all(candidates.map((newPassword) => request("/auth/password", {
      method: "PUT", cookie, body: { currentPassword: password, newPassword },
    })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [204, 401]);
    await expectError(responses.find((response) => response.status === 401), 401, "INVALID_CREDENTIALS");
    const stored = await authRepository.findUserByEmail(account.email);
    const winningPassword = candidates[responses.findIndex((response) => response.status === 204)];
    assert.equal(verifyPassword(winningPassword, stored.salt, stored.password_hash), true);
    assert.equal(stored.mustChangePassword, false);
  });
});
