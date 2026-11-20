import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import hikersRepository from "../../../src/database/hikers.repository.js";
import staffReservationsService from "../../../src/services/staffReservations.service.js";
import authRepository from "../../../src/database/auth.repository.js";
import passwordResetEmailService from "../../../src/services/passwordResetEmail.service.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "mh07-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let apiUrl;

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  apiUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

const userIds = { employee: 3, hiker: 4, warden: 5 };
const rolesById = { 3: "employee", 4: "hiker", 5: "warden" };

beforeEach(() => {
  mock.method(authRepository, "findUserById", async (id) => ({
    id, role: rolesById[id], mustChangePassword: false,
  }));
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

const loginCookie = (role, id = userIds[role]) =>
  `token=${jwt.sign({ id, role }, testJwtSecret, { expiresIn: "1d" })}`;

async function requestJson(path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

describe("MH-07 HTTP controller & service integration tests", () => {
  describe("GET /api/v1/staff/hikers", () => {
    it("enforces authentication (401) and staff role (403)", async () => {
      const repoMock = mock.method(hikersRepository, "searchHikers", async () => []);

      const unauth = await requestJson("/staff/hikers?q=Neri");
      const hiker = await requestJson("/staff/hikers?q=Neri", { cookie: loginCookie("hiker", 4) });

      assert.equal(unauth.status, 401);
      assert.equal(unauth.body.error, "NOT_AUTHENTICATED");
      assert.equal(hiker.status, 403);
      assert.equal(hiker.body.error, "FORBIDDEN_ROLE");
      assert.equal(repoMock.mock.callCount(), 0);
    });

    it("returns 400 INVALID_INPUT for queries shorter than 2 characters and 200 for valid staff search", async () => {
      const matches = [{ id: 4, firstName: "Anna", lastName: "Neri", isTemporary: false }];
      const repoMock = mock.method(hikersRepository, "searchHikers", async () => matches);

      const shortRes = await requestJson("/staff/hikers?q=A", { cookie: loginCookie("employee") });
      assert.equal(shortRes.status, 400);
      assert.equal(shortRes.body.error, "INVALID_INPUT");

      const okRes = await requestJson("/staff/hikers?q=%20Neri%20", { cookie: loginCookie("warden") });
      assert.equal(okRes.status, 200);
      assert.deepEqual(okRes.body, matches);
      assert.deepEqual(repoMock.mock.calls[0].arguments, ["Neri"]);
    });
  });

  describe("POST /api/v1/staff/reservations", () => {
    it("enforces authentication (401) and staff role (403)", async () => {
      const serviceMock = mock.method(staffReservationsService, "createStaffReservation", async () => ({}));
      const validPayload = {
        slotId: 7,
        partySize: 2,
        temporaryHiker: { firstName: "Luca", lastName: "Neri" },
      };

      const unauth = await requestJson("/staff/reservations", {
        method: "POST",
        body: validPayload,
      });
      const hiker = await requestJson("/staff/reservations", {
        method: "POST",
        cookie: loginCookie("hiker", 4),
        body: validPayload,
      });

      assert.equal(unauth.status, 401);
      assert.equal(hiker.status, 403);
      assert.equal(serviceMock.mock.callCount(), 0);
    });

    it("returns 400 INVALID_INPUT on malformed body or requirements and 201 on valid booking", async () => {
      const created = { id: 55, slotId: 7, partySize: 2, status: "confirmed" };
      const serviceMock = mock.method(staffReservationsService, "createStaffReservation", async () => created);

      const badReq = await requestJson("/staff/reservations", {
        method: "POST",
        cookie: loginCookie("employee", 3),
        body: {
          slotId: 7,
          partySize: 1,
          requirements: [{ peopleCount: 2, hasAllergies: false, description: "Too many" }],
          temporaryHiker: { firstName: "Luca", lastName: "Neri" },
        },
      });
      assert.equal(badReq.status, 400);
      assert.equal(badReq.body.error, "INVALID_INPUT");

      const okRes = await requestJson("/staff/reservations", {
        method: "POST",
        cookie: loginCookie("employee", 3),
        body: {
          slotId: 7,
          partySize: 2,
          temporaryHiker: { firstName: "Luca", lastName: "Neri" },
        },
      });
      assert.equal(okRes.status, 201);
      assert.deepEqual(okRes.body, created);
      assert.equal(serviceMock.mock.calls[0].arguments[0], 3);
    });
  });

  describe("POST /api/v1/auth/password-reset/request & /confirm", () => {
    it("returns 202 for valid password-reset request and 400 INVALID_INPUT for bad email", async () => {
      mock.method(authRepository, "findPasswordResetUserByEmail", async () => null);
      mock.method(passwordResetEmailService, "sendPasswordResetEmail", async () => true);

      const badRes = await requestJson("/auth/password-reset/request", {
        method: "POST",
        body: { email: "bad-email" },
      });
      assert.equal(badRes.status, 400);
      assert.equal(badRes.body.error, "INVALID_INPUT");

      const okRes = await requestJson("/auth/password-reset/request", {
        method: "POST",
        body: { email: "anna@example.com" },
      });
      assert.equal(okRes.status, 202);
      assert.equal(okRes.body, null);
    });

    it("returns 204 when password reset succeeds and 400 INVALID_RESET_TOKEN when token is invalid", async () => {
      const validSecret = ["New", "Secret", "2026!"].join("");
      let validToken = false;

      mock.method(authRepository, "findValidPasswordResetToken", async () =>
        validToken ? { userId: 8 } : null,
      );
      mock.method(authRepository, "confirmPasswordReset", async () => true);

      const invalidRes = await requestJson("/auth/password-reset/confirm", {
        method: "POST",
        body: { token: "unknown-token", newPassword: validSecret },
      });
      assert.equal(invalidRes.status, 400);
      assert.equal(invalidRes.body.error, "INVALID_RESET_TOKEN");

      validToken = true;
      const validRes = await requestJson("/auth/password-reset/confirm", {
        method: "POST",
        body: { token: "known-token", newPassword: validSecret },
      });
      assert.equal(validRes.status, 204);
      assert.equal(validRes.body, null);
    });
  });
});
