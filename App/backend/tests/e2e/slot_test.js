import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = "slots-e2e-test-secret";
let server;
let baseUrl;
let authUrl;

let employeeUserId;
let hikerUserId;

const E2E_DATE_CYCLE = "2098-05-10";
const E2E_DATE_ERRORS = "2098-05-11";

async function clearE2ESlots() {
  await pool.query("DELETE FROM slot_table WHERE slot_id IN (SELECT id FROM slot WHERE start_at >= '2098-01-01')").catch(() => {});
  await pool.query("DELETE FROM slot WHERE start_at >= '2098-01-01'").catch(() => {});
}

async function setupTestUsers() {
  const employeeEmail = "employee_slot_e2e@example.com";
  const hikerEmail = "hiker_slot_e2e@example.com";

  const registerUser = async (email) => {
    await fetch(`${authUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: "Password123!",
        firstName: "Test",
        lastName: "User"
      })
    });
  };

  await registerUser(employeeEmail);
  await registerUser(hikerEmail);

  // Impostiamo i ruoli corretti in base al vincolo CHECK ('hiker', 'employee', 'warden')
  await pool.query(`UPDATE app_user SET role = 'employee' WHERE email = $1`, [employeeEmail]);
  await pool.query(`UPDATE app_user SET role = 'hiker' WHERE email = $1`, [hikerEmail]);

  const empDb = await pool.query(`SELECT id, role FROM app_user WHERE email = $1`, [employeeEmail]);
  employeeUserId = empDb.rows[0].id;

  const hikerDb = await pool.query(`SELECT id, role FROM app_user WHERE email = $1`, [hikerEmail]);
  hikerUserId = hikerDb.rows[0].id;
}

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = "test";

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/slots`;
  authUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;

  await setupTestUsers();
  await clearE2ESlots();
});

after(async () => {
  await clearE2ESlots();
  await pool.query(`DELETE FROM app_user WHERE email IN ('employee_slot_e2e@example.com', 'hiker_slot_e2e@example.com')`).catch(() => {});

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
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

beforeEach(async () => {
  await clearE2ESlots();
});

function createAuthCookie(role = "employee", userId) {
  const isEmployee = role.toLowerCase() === "employee" || role.toLowerCase() === "warden";
  const targetId = userId || (isEmployee ? employeeUserId : hikerUserId);
  const targetRole = role.toLowerCase();

  const token = jwt.sign(
    {
      id: targetId,
      userId: targetId,
      email: `${targetRole}@example.com`,
      role: targetRole,
      Role: targetRole,
      roles: [targetRole],
      user: { id: targetId, role: targetRole }
    },
    testJwtSecret
  );
  return `token=${token}`;
}

async function sendRequest(path = "", { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("slots end-to-end", () => {
  it("completes full creation, retrieval, and copying cycle", async () => {
    const employeeCookie = createAuthCookie("employee");

    const startAt = `${E2E_DATE_CYCLE}T12:00:00+01:00`;
    const endAt = `${E2E_DATE_CYCLE}T13:00:00+01:00`;
    const copyStartAt = `${E2E_DATE_CYCLE}T13:00:00+01:00`;
    const copyEndAt = `${E2E_DATE_CYCLE}T14:00:00+01:00`;

    const createPayload = {
      startAt,
      endAt,
      tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 6 }],
    };

    const createResponse = await sendRequest("", {
      method: "POST",
      body: createPayload,
      cookie: employeeCookie,
    });
    const createdSlot = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.ok(createdSlot.id);
    assert.equal(createdSlot.totalSeats, 10);

    const getResponse = await sendRequest(`/${createdSlot.id}`, { cookie: employeeCookie });
    const fetchedSlot = await getResponse.json();

    assert.equal(getResponse.status, 200);
    assert.equal(fetchedSlot.id, createdSlot.id);
    
    const copyPayload = {
      startAt: copyStartAt,
      endAt: copyEndAt,
      copyTablesFromSlotId: createdSlot.id,
    };

    const copyResponse = await sendRequest("", {
      method: "POST",
      body: copyPayload,
      cookie: employeeCookie,
    });
    const copiedSlot = await copyResponse.json();

    assert.equal(copyResponse.status, 201);
    assert.ok(copiedSlot.id);
  });

  it("handles validation, overlap and missing slot errors", async () => {
    const employeeCookie = createAuthCookie("employee");

    const invalidDatesRes = await sendRequest("", {
      method: "POST",
      body: { startAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`, endAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`, tables: [{ tableNumber: 1, seats: 4 }] },
      cookie: employeeCookie,
    });
    assert.equal(invalidDatesRes.status, 400);

    const notFoundCopyRes = await sendRequest("", {
      method: "POST",
      body: { startAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`, endAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`, copyTablesFromSlotId: 999999 },
      cookie: employeeCookie,
    });
    assert.equal(notFoundCopyRes.status, 404);

    const baseSlotRes = await sendRequest("", {
      method: "POST",
      body: { startAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`, endAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`, tables: [{ tableNumber: 1, seats: 4 }] },
      cookie: employeeCookie,
    });
    assert.equal(baseSlotRes.status, 201);

    const overlapRes = await sendRequest("", {
      method: "POST",
      body: { startAt: `${E2E_DATE_ERRORS}T12:30:00+01:00`, endAt: `${E2E_DATE_ERRORS}T13:30:00+01:00`, tables: [{ tableNumber: 2, seats: 4 }] },
      cookie: employeeCookie,
    });
    assert.equal(overlapRes.status, 409);
  });

  it("rejects unauthenticated and non-staff requests", async () => {
    const hikerCookie = createAuthCookie("hiker");

    const noAuthRes = await sendRequest("", {
      method: "POST",
      body: { startAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`, endAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`, tables: [{ tableNumber: 1, seats: 4 }] },
    });
    assert.equal(noAuthRes.status, 401);

    const forbiddenRes = await sendRequest("", {
      method: "POST",
      body: { startAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`, endAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`, tables: [{ tableNumber: 1, seats: 4 }] },
      cookie: hikerCookie,
    });
    assert.equal(forbiddenRes.status, 403);
  });
});