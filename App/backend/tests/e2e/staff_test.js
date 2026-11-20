import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import authRepository from "../../src/database/auth.repository.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = "staff-e2e-test-secret";
const TEST_EMAIL_PATTERN = "staff-e2e-%@example.com";
const wardenPassword = "WardenPassword1";
const temporaryPassword = "Temporary123";
const server = app.listen(0, "127.0.0.1");
let baseUrl;
let warden;
let wardenCookie;

async function deleteTestUsers() {
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_PATTERN]);
}

const createTestEmail = () => `staff-e2e-${randomUUID()}@example.com`;

async function sendRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
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

const employeeInput = (fields = {}) => ({ email: createTestEmail(), password: temporaryPassword, firstName: "Ada", lastName: "Lovelace", ...fields });

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = "test";
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  await deleteTestUsers();
  const { hash, salt } = hashPassword(wardenPassword);
  warden = await authRepository.createUser({ email: createTestEmail(), hash, salt, firstName: "Marco", lastName: "Warden", role: "warden" });
  wardenCookie = (await login(warden.email, wardenPassword)).cookie;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await deleteTestUsers();
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

describe("employee accounts end-to-end", () => {
  // Verifies the warden creates an employee who can log in with the temporary password and appears in the list.
  it("creates an employee who can log in with the temporary password", async () => {
    const input = employeeInput({ phone: "3331234567" });

    const created = await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: input });
    const { user } = await login(input.email, temporaryPassword);
    const list = await sendRequest("/staff/employees", { cookie: wardenCookie });
    const listed = list.body.find((employee) => employee.id === created.body.id);

    assert.equal(created.status, 201);
    assert.deepEqual(created.body, { id: created.body.id, email: input.email, firstName: "Ada", lastName: "Lovelace", phone: "3331234567", role: "employee", mustChangePassword: true });
    assert.deepEqual(user, { id: created.body.id, email: input.email, firstName: "Ada", lastName: "Lovelace", role: "employee", mustChangePassword: true });
    assert.equal(list.status, 200);
    assert.deepEqual(Object.keys(listed).sort(), ["createdAt", "email", "firstName", "id", "lastName", "mustChangePassword", "phone"]);
    assert.equal(listed.mustChangePassword, true);
    assert.ok(Number.isFinite(Date.parse(listed.createdAt)));
  });

  // Verifies the list has only employees, sorted by last name and first name.
  it("lists only employees sorted by last name and first name", async () => {
    const hikerEmail = createTestEmail();
    const registered = await sendRequest("/auth/register", { method: "POST", body: { email: hikerEmail, password: "HikerPassword1", firstName: "Hugo", lastName: "Hiker" } });
    const created = [];
    for (const [firstName, lastName] of [["Zeno", "Zanetti"], ["Bruno", "Abate"], ["Anna", "Abate"]]) {
      created.push((await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: employeeInput({ firstName, lastName }) })).body);
    }

    const list = (await sendRequest("/staff/employees", { cookie: wardenCookie })).body;
    const ours = list.filter((employee) => created.some((user) => user.id === employee.id));

    assert.equal(registered.status, 201);
    assert.ok(list.every((employee) => employee.id !== warden.id && employee.id !== registered.body.id));
    assert.deepEqual(ours.map((employee) => `${employee.lastName} ${employee.firstName}`), ["Abate Anna", "Abate Bruno", "Zanetti Zeno"]);
  });

  // Verifies an email already used by a hiker cannot be reused for an employee, and the other way round.
  it("keeps emails unique across hikers and employees", async () => {
    const hikerEmail = createTestEmail();
    const employee = employeeInput();
    await sendRequest("/auth/register", { method: "POST", body: { email: hikerEmail, password: "HikerPassword1", firstName: "Hugo", lastName: "Hiker" } });
    await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: employee });

    const employeeWithHikerEmail = await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: employeeInput({ email: hikerEmail.toUpperCase() }) });
    const hikerWithEmployeeEmail = await sendRequest("/auth/register", { method: "POST", body: { email: employee.email, password: "HikerPassword1", firstName: "Hugo", lastName: "Hiker" } });

    assertError(employeeWithHikerEmail, 409, "EMAIL_ALREADY_USED");
    assertError(hikerWithEmployeeEmail, 409, "EMAIL_ALREADY_USED");
  });

  // Verifies invalid employee data gives 400 INVALID_INPUT and no account is created.
  it("rejects invalid employee data without creating an account", async () => {
    for (const fields of [{ email: "not-an-email" }, { password: "short" }, { lastName: "" }, { phone: "333-123" }, { notes: "Mountain guide" }]) {
      const input = employeeInput(fields);

      assertError(await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: input }), 400, "INVALID_INPUT");
      assertError(await sendRequest("/auth/login", { method: "POST", body: { email: input.email, password: input.password } }), 401, "INVALID_CREDENTIALS");
    }
  });

  // Verifies anonymous users, hikers and employees cannot create or list employees.
  it("allows only the warden to create and list employees", async () => {
    const hikerEmail = createTestEmail();
    await sendRequest("/auth/register", { method: "POST", body: { email: hikerEmail, password: "HikerPassword1", firstName: "Hugo", lastName: "Hiker" } });
    const employee = employeeInput();
    await sendRequest("/staff/employees", { method: "POST", cookie: wardenCookie, body: employee });
    const employeeSession = await login(employee.email, temporaryPassword);
    await sendRequest("/auth/password", { method: "PUT", cookie: employeeSession.cookie, body: { currentPassword: temporaryPassword, newPassword: "Permanent456" } });
    const hikerSession = await login(hikerEmail, "HikerPassword1");

    for (const [cookie, status, code] of [[undefined, 401, "NOT_AUTHENTICATED"], [hikerSession.cookie, 403, "FORBIDDEN_ROLE"], [employeeSession.cookie, 403, "FORBIDDEN_ROLE"]]) {
      assertError(await sendRequest("/staff/employees", { cookie }), status, code);
      assertError(await sendRequest("/staff/employees", { method: "POST", cookie, body: employeeInput() }), status, code);
    }
  });
});
