import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import authRepository from "../../../src/database/auth.repository.js";
import staffRepository from "../../../src/database/staff.repository.js";
import { verifyPassword } from "../../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "staff-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;
let storedUsers;
let nextUserId;

const WARDEN_ID = 1;
const EMPLOYEE_ID = 2;
const HIKER_ID = 3;
const TEMPORARY_WARDEN_ID = 4;

function seedUsers() {
  storedUsers = new Map();
  nextUserId = 100;
  for (const [id, role, mustChangePassword] of [[WARDEN_ID, "warden", false], [EMPLOYEE_ID, "employee", false], [HIKER_ID, "hiker", false], [TEMPORARY_WARDEN_ID, "warden", true]]) {
    storedUsers.set(id, { id, email: `${role}${id}@example.com`, firstName: "Test", lastName: role, phone: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, role, mustChangePassword, password_hash: "hash", salt: "salt" });
  }
}

function mockRepositories() {
  mock.method(authRepository, "findUserById", async (id) => {
    const user = storedUsers.get(id);
    if (!user) return null;
    const { password_hash, salt, ...profile } = user;
    return profile;
  });
  mock.method(authRepository, "findUserByEmail", async (email) => [...storedUsers.values()].find((user) => user.email === email) ?? null);
  const createUserMock = mock.method(authRepository, "createUser", async ({ email, hash, salt, firstName, lastName, phone, emergencyContactName, emergencyContactPhone, notes, role, mustChangePassword }) => {
    const user = { id: nextUserId++, email, firstName, lastName, phone: phone || null, emergencyContactName: emergencyContactName || null, emergencyContactPhone: emergencyContactPhone || null, notes: notes || null, role };
    storedUsers.set(user.id, { ...user, mustChangePassword, password_hash: hash, salt });
    return user;
  });
  const listEmployeesMock = mock.method(staffRepository, "listEmployees", async () => [...storedUsers.values()]
    .filter((user) => user.role === "employee")
    .map(({ id, email, firstName, lastName, phone, mustChangePassword }) => ({ id, email, firstName, lastName, phone, mustChangePassword, createdAt: new Date("2026-11-15T09:30:00Z") })));
  return { createUserMock, listEmployeesMock };
}

const cookieFor = (id, role = storedUsers.get(id)?.role) => `token=${jwt.sign({ id, role }, testJwtSecret)}`;

async function sendRequest(path, { method = "GET", body, rawBody, cookie } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.body.error, code);
}

const validEmployee = () => ({ email: "new.employee@example.com", password: "Temporary123", firstName: "Ada", lastName: "Lovelace" });

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/staff`;
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

describe("POST /api/v1/staff/employees service and controller integration", () => {
  // Verifies a warden creates an employee: 201 with the documented body, stored with role employee and a temporary password.
  it("creates an employee with a temporary password", async () => {
    const { createUserMock } = mockRepositories();

    const response = await sendRequest("/employees", {
      method: "POST",
      cookie: cookieFor(WARDEN_ID),
      body: { ...validEmployee(), email: " New.Employee@Example.com ", phone: "3331234567", role: "warden", mustChangePassword: false },
    });
    const saved = createUserMock.mock.calls[0].arguments[0];

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { id: 100, email: "new.employee@example.com", firstName: "Ada", lastName: "Lovelace", phone: "3331234567", role: "employee", mustChangePassword: true });
    assert.equal(saved.role, "employee");
    assert.equal(saved.mustChangePassword, true);
    assert.equal(verifyPassword("Temporary123", saved.salt, saved.hash), true);
  });

  // Verifies invalid bodies, hiker-only fields and malformed JSON give 400 INVALID_INPUT and nothing is created.
  it("rejects invalid input with 400 INVALID_INPUT", async () => {
    const { createUserMock } = mockRepositories();
    const invalidBodies = [
      {},
      [],
      { ...validEmployee(), email: "not-an-email" },
      { ...validEmployee(), password: "short" },
      { ...validEmployee(), firstName: " " },
      { ...validEmployee(), lastName: "L".repeat(101) },
      { ...validEmployee(), phone: "333-123" },
      { ...validEmployee(), notes: "Mountain guide" },
      { ...validEmployee(), emergencyContactName: null },
    ];

    for (const body of invalidBodies) {
      assertError(await sendRequest("/employees", { method: "POST", cookie: cookieFor(WARDEN_ID), body }), 400, "INVALID_INPUT");
    }
    assertError(await sendRequest("/employees", { method: "POST", cookie: cookieFor(WARDEN_ID), rawBody: "{\"email\":" }), 400, "INVALID_INPUT");

    assert.equal(createUserMock.mock.callCount(), 0);
  });

  // Verifies an email that already belongs to an account gives 409 EMAIL_ALREADY_USED.
  it("rejects an email that is already used", async () => {
    const { createUserMock } = mockRepositories();

    const response = await sendRequest("/employees", { method: "POST", cookie: cookieFor(WARDEN_ID), body: { ...validEmployee(), email: "HIKER3@example.com" } });

    assertError(response, 409, "EMAIL_ALREADY_USED");
    assert.equal(createUserMock.mock.callCount(), 0);
  });
});

describe("GET /api/v1/staff/employees service and controller integration", () => {
  // Verifies a warden gets 200 with only employees and the documented fields.
  it("returns the employees to a warden", async () => {
    mockRepositories();

    const response = await sendRequest("/employees", { cookie: cookieFor(WARDEN_ID) });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, [{ id: EMPLOYEE_ID, email: "employee2@example.com", firstName: "Test", lastName: "employee", phone: null, mustChangePassword: false, createdAt: "2026-11-15T09:30:00.000Z" }]);
  });

  // Verifies an employee created through the API shows up in the list with mustChangePassword true.
  it("lists a newly created employee as still needing a password change", async () => {
    mockRepositories();

    const created = await sendRequest("/employees", { method: "POST", cookie: cookieFor(WARDEN_ID), body: validEmployee() });
    const response = await sendRequest("/employees", { cookie: cookieFor(WARDEN_ID) });

    assert.equal(created.status, 201);
    assert.equal(response.body.find((employee) => employee.id === created.body.id).mustChangePassword, true);
  });

  // Verifies an unexpected repository error gives 500 INTERNAL_ERROR without details.
  it("returns 500 when the repository fails", async () => {
    mockRepositories();
    mock.method(staffRepository, "listEmployees", async () => { throw new Error("connection refused"); });

    const response = await sendRequest("/employees", { cookie: cookieFor(WARDEN_ID) });

    assertError(response, 500, "INTERNAL_ERROR");
    assert.doesNotMatch(response.body.message, /connection refused/);
  });
});

describe("staff employee routes access control", () => {
  // Verifies requests without a valid session get 401 NOT_AUTHENTICATED on both routes.
  it("rejects requests without a valid session", async () => {
    const { createUserMock, listEmployeesMock } = mockRepositories();

    for (const cookie of [undefined, "token=invalid", cookieFor(999, "warden")]) {
      assertError(await sendRequest("/employees", { cookie }), 401, "NOT_AUTHENTICATED");
      assertError(await sendRequest("/employees", { method: "POST", cookie, body: validEmployee() }), 401, "NOT_AUTHENTICATED");
    }

    assert.equal(createUserMock.mock.callCount(), 0);
    assert.equal(listEmployeesMock.mock.callCount(), 0);
  });

  // Verifies employees and hikers get 403 FORBIDDEN_ROLE: the routes are for the warden only.
  it("rejects employees and hikers with 403 FORBIDDEN_ROLE", async () => {
    const { createUserMock, listEmployeesMock } = mockRepositories();

    for (const id of [EMPLOYEE_ID, HIKER_ID]) {
      assertError(await sendRequest("/employees", { cookie: cookieFor(id) }), 403, "FORBIDDEN_ROLE");
      assertError(await sendRequest("/employees", { method: "POST", cookie: cookieFor(id), body: validEmployee() }), 403, "FORBIDDEN_ROLE");
    }

    assert.equal(createUserMock.mock.callCount(), 0);
    assert.equal(listEmployeesMock.mock.callCount(), 0);
  });

  // Verifies the role is read from the database, so a token with an old role does not decide access.
  it("uses the current database role instead of the role in the token", async () => {
    mockRepositories();

    assertError(await sendRequest("/employees", { cookie: cookieFor(EMPLOYEE_ID, "warden") }), 403, "FORBIDDEN_ROLE");
    assert.equal((await sendRequest("/employees", { cookie: cookieFor(WARDEN_ID, "hiker") })).status, 200);
  });

  // Verifies a warden who still has a temporary password must change it first.
  it("rejects a warden with a temporary password with 403 PASSWORD_CHANGE_REQUIRED", async () => {
    const { createUserMock, listEmployeesMock } = mockRepositories();

    assertError(await sendRequest("/employees", { cookie: cookieFor(TEMPORARY_WARDEN_ID) }), 403, "PASSWORD_CHANGE_REQUIRED");
    assertError(await sendRequest("/employees", { method: "POST", cookie: cookieFor(TEMPORARY_WARDEN_ID), body: validEmployee() }), 403, "PASSWORD_CHANGE_REQUIRED");

    assert.equal(createUserMock.mock.callCount(), 0);
    assert.equal(listEmployeesMock.mock.callCount(), 0);
  });
});
