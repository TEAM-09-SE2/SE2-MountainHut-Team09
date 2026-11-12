import { before, after, describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import pool from "../../../src/database/connection.js";
import app from "../../../src/app.js";

const testJwtSecret = "slots-integration-test-secret";
const originalJwtSecret = process.env.JWT_SECRET;
let server;
let baseUrl;
let authUrl;

let employeeUserId;
let hikerUserId;

const CTRL_DATE = "2096-05-10";

async function clearCtrlSlots() {
  await pool.query("DELETE FROM slot_table WHERE slot_id IN (SELECT id FROM slot WHERE start_at >= '2096-01-01' AND start_at < '2097-01-01')").catch(() => {});
  await pool.query("DELETE FROM slot WHERE start_at >= '2096-01-01' AND start_at < '2097-01-01'").catch(() => {});
}

async function setupTestUsers() {
  const employeeEmail = "employee_slot_ctrl@example.com";
  const hikerEmail = "hiker_slot_ctrl@example.com";

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

  await pool.query(`UPDATE app_user SET role = 'employee' WHERE email = $1`, [employeeEmail]);
  await pool.query(`UPDATE app_user SET role = 'hiker' WHERE email = $1`, [hikerEmail]);

  const empDb = await pool.query(`SELECT id, role FROM app_user WHERE email = $1`, [employeeEmail]);
  employeeUserId = empDb.rows[0].id;

  const hikerDb = await pool.query(`SELECT id, role FROM app_user WHERE email = $1`, [hikerEmail]);
  hikerUserId = hikerDb.rows[0].id;
}

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

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/slots`;
  authUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;

  await setupTestUsers();
  await clearCtrlSlots();
});

after(async () => {
  await clearCtrlSlots();
  await pool.query(`DELETE FROM app_user WHERE email IN ('employee_slot_ctrl@example.com', 'hiker_slot_ctrl@example.com')`).catch(() => {});

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
});

beforeEach(async () => {
  await clearCtrlSlots();
});

describe("slots controller and service integration", () => {
  describe("POST /api/v1/slots", () => {
    it("returns 201 with created slot for authenticated staff user", async () => {
      const employeeCookie = createAuthCookie("employee");
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: employeeCookie },
        body: JSON.stringify({
          startAt: `${CTRL_DATE}T12:00:00+01:00`,
          endAt: `${CTRL_DATE}T13:00:00+01:00`,
          tables: [{ tableNumber: 1, seats: 4 }],
        }),
      });

      const body = await response.json();
      assert.equal(response.status, 201);
      assert.ok(body.id);
      assert.equal(body.totalSeats, 4);
    });

    it("returns 401 NOT_AUTHENTICATED when request has no token cookie", async () => {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startAt: `${CTRL_DATE}T12:00:00+01:00`,
          endAt: `${CTRL_DATE}T13:00:00+01:00`,
          tables: [{ tableNumber: 1, seats: 4 }],
        }),
      });

      const body = await response.json();
      assert.equal(response.status, 401);
      assert.equal(body.error, "NOT_AUTHENTICATED");
    });

    it("returns 403 FORBIDDEN_ROLE when user has hiker role", async () => {
      const hikerCookie = createAuthCookie("hiker");
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: hikerCookie },
        body: JSON.stringify({
          startAt: `${CTRL_DATE}T12:00:00+01:00`,
          endAt: `${CTRL_DATE}T13:00:00+01:00`,
          tables: [{ tableNumber: 1, seats: 4 }],
        }),
      });

      const body = await response.json();
      assert.equal(response.status, 403);
      assert.equal(body.error, "FORBIDDEN_ROLE");
    });

    it("returns 400 INVALID_INPUT if input validation fails", async () => {
      const employeeCookie = createAuthCookie("employee");
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: employeeCookie },
        body: JSON.stringify({
          startAt: `${CTRL_DATE}T12:00:00+01:00`,
          endAt: `${CTRL_DATE}T13:00:00+01:00`,
          tables: [],
        }),
      });

      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.error, "INVALID_INPUT");
    });
  });

  describe("GET /api/v1/slots/:id", () => {
    it("returns 404 SLOT_NOT_FOUND when requesting non-existent slot", async () => {
      const employeeCookie = createAuthCookie("employee");
      const response = await fetch(`${baseUrl}/999999`, {
        headers: { cookie: employeeCookie },
      });
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.equal(body.error, "SLOT_NOT_FOUND");
    });
  });
});