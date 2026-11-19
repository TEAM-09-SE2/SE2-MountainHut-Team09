import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import emailSender from "../../src/emails/emailSender.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalClientUrl = process.env.CLIENT_URL;
const testJwtSecret = "mh07-e2e-test-secret";
const server = app.listen(0, "127.0.0.1");
let apiUrl;

const buildSecret = (prefix) => [prefix, "Secret", "2026!"].join("");

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.CLIENT_URL = "http://localhost:5173";

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  apiUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  await pool.end();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  if (originalClientUrl === undefined) {
    delete process.env.CLIENT_URL;
  } else {
    process.env.CLIENT_URL = originalClientUrl;
  }
});

function createFixture(testContext) {
  const fixture = {
    userIds: [],
    slotIds: [],
    reservationIds: [],
  };

  testContext.after(async () => {
    if (fixture.reservationIds.length > 0) {
      await pool.query(
        "DELETE FROM reservation_requirement WHERE reservation_id = ANY($1::int[])",
        [fixture.reservationIds],
      );
      await pool.query(
        "DELETE FROM reservation_seat WHERE reservation_id = ANY($1::int[])",
        [fixture.reservationIds],
      );
      await pool.query(
        "DELETE FROM reservation WHERE id = ANY($1::int[])",
        [fixture.reservationIds],
      );
    }

    if (fixture.slotIds.length > 0) {
      await pool.query(
        "DELETE FROM reservation_seat WHERE slot_id = ANY($1::int[])",
        [fixture.slotIds],
      );
      await pool.query(
        "DELETE FROM reservation WHERE slot_id = ANY($1::int[])",
        [fixture.slotIds],
      );
      await pool.query(
        "DELETE FROM slot_table WHERE slot_id = ANY($1::int[])",
        [fixture.slotIds],
      );
      await pool.query(
        "DELETE FROM slot WHERE id = ANY($1::int[])",
        [fixture.slotIds],
      );
    }

    if (fixture.userIds.length > 0) {
      await pool.query(
        "DELETE FROM password_reset_token WHERE user_id = ANY($1::int[])",
        [fixture.userIds],
      );
      await pool.query(
        "DELETE FROM app_user WHERE id = ANY($1::int[])",
        [fixture.userIds],
      );
    }
  });

  return fixture;
}

async function seedUser(fixture, options) {
  const role = options?.role ?? "hiker";
  const firstName = options?.firstName ?? "Ada";
  const lastName = options?.lastName ?? `User-${randomUUID().slice(0, 8)}`;
  const email = options?.email ?? `mh07-e2e-${randomUUID()}@example.com`;
  const { salt, hash } = hashPassword(buildSecret("Initial"));

  const { rows: [user] } = await pool.query(
    `INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, role`,
    [email, hash, salt, firstName, lastName, role],
  );
  fixture.userIds.push(user.id);
  return user;
}

async function seedFutureSlot(fixture, createdBy, tableCapacities) {
  const startAt = "2097-06-15T12:00:00.000Z";
  const endAt = "2097-06-15T13:30:00.000Z";
  const { rows: [slot] } = await pool.query(
    `INSERT INTO slot (start_at, end_at, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [startAt, endAt, createdBy],
  );
  fixture.slotIds.push(slot.id);

  for (const [index, seats] of tableCapacities.entries()) {
    await pool.query(
      `INSERT INTO slot_table (slot_id, table_number, seats)
       VALUES ($1, $2, $3)`,
      [slot.id, index + 1, seats],
    );
  }
  return slot.id;
}

const staffCookie = (staffUser) =>
  `token=${jwt.sign({ id: staffUser.id, role: staffUser.role }, testJwtSecret, { expiresIn: "1d" })}`;

async function apiRequest(path, options) {
  const method = options?.method ?? "GET";
  const cookie = options?.cookie;
  const body = options?.body;

  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const rawText = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: rawText ? JSON.parse(rawText) : null,
  };
}

describe("MH-07 end-to-end (staff reservations, temporary hikers & password reset)", () => {
  it("books for a temporary hiker, persists in PostgreSQL, and finds them via GET /staff/hikers", async (t) => {
    const fixture = createFixture(t);
    const staff = await seedUser(fixture, { role: "employee", firstName: "Marco", lastName: "Rossi" });
    const slotId = await seedFutureSlot(fixture, staff.id, [4]);
    const uniqueSurname = `Temp_${randomUUID().slice(0, 8)}`;

    const sendMock = mock.method(emailSender, "send", async () => {});

    const bookingRes = await apiRequest("/staff/reservations", {
      method: "POST",
      cookie: staffCookie(staff),
      body: {
        slotId,
        partySize: 2,
        requirements: [{ peopleCount: 1, hasAllergies: true, description: "Nut allergy" }],
        temporaryHiker: {
          firstName: "Giulia",
          lastName: uniqueSurname,
          phone: "3331122334",
        },
      },
    });

    assert.equal(bookingRes.status, 201);
    fixture.reservationIds.push(bookingRes.body.id);
    fixture.userIds.push(bookingRes.body.hiker.id);

    assert.equal(bookingRes.body.confirmationSent, false);
    assert.equal("temporaryPassword" in bookingRes.body, false);
    assert.equal(bookingRes.body.hiker.isTemporary, true);
    assert.equal(bookingRes.body.hiker.email, null);
    assert.equal(bookingRes.body.createdBy.id, staff.id);
    assert.equal(sendMock.mock.callCount(), 0);

    // Verify database flags directly
    const { rows: [dbUser] } = await pool.query(
      "SELECT is_temporary, must_change_password, password_hash FROM app_user WHERE id = $1",
      [bookingRes.body.hiker.id],
    );
    assert.equal(dbUser.is_temporary, true);
    assert.equal(dbUser.must_change_password, false);
    assert.equal(dbUser.password_hash, null);

    // Search the temporary hiker through the real SQL query
    const searchRes = await apiRequest(
      `/staff/hikers?q=${encodeURIComponent(uniqueSurname)}`,
      { cookie: staffCookie(staff) },
    );
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.length, 1);
    assert.equal(searchRes.body[0].id, bookingRes.body.hiker.id);
    assert.equal(searchRes.body[0].isTemporary, true);
  });

  it("creates a new hiker account with temporaryPassword and completes the password-reset lifecycle", async (t) => {
    const fixture = createFixture(t);
    const staff = await seedUser(fixture, { role: "warden", firstName: "Elena", lastName: "Conti" });
    const slotId = await seedFutureSlot(fixture, staff.id, [4]);
    const hikerEmail = `mh07-new-hiker-${randomUUID()}@example.com`;

    const sentEmails = [];
    mock.method(emailSender, "send", async (mail) => {
      sentEmails.push(mail);
    });

    // 1. Staff books for a brand-new full hiker account
    const createRes = await apiRequest("/staff/reservations", {
      method: "POST",
      cookie: staffCookie(staff),
      body: {
        slotId,
        partySize: 2,
        newHiker: {
          email: hikerEmail,
          firstName: "Davide",
          lastName: "Ferri",
          phone: "3475566778",
        },
      },
    });

    assert.equal(createRes.status, 201);
    fixture.reservationIds.push(createRes.body.id);
    fixture.userIds.push(createRes.body.hiker.id);

    const tempPassword = createRes.body.temporaryPassword;
    assert.equal(typeof tempPassword, "string");
    assert.equal(tempPassword.length, 12);
    assert.equal(createRes.body.confirmationSent, true);
    assert.equal(sentEmails.length, 1);

    // 2. Log in with the temporary password and confirm mustChangePassword is true
    const tempLoginRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { email: hikerEmail, password: tempPassword },
    });
    assert.equal(tempLoginRes.status, 200);
    const tempCookie = tempLoginRes.headers.get("set-cookie")?.split(";")[0];
    assert.ok(tempCookie);

    const meBeforeReset = await apiRequest("/auth/me", { cookie: tempCookie });
    assert.equal(meBeforeReset.status, 200);
    assert.equal(meBeforeReset.body.mustChangePassword, true);

    // 3. Request a password reset email and extract the real token from the email body
    const resetReqRes = await apiRequest("/auth/password-reset/request", {
      method: "POST",
      body: { email: hikerEmail },
    });
    assert.equal(resetReqRes.status, 202);
    assert.equal(sentEmails.length, 2);

    const resetEmail = sentEmails[1];
    assert.equal(resetEmail.to, hikerEmail);
    const tokenMatch = resetEmail.text.match(/token=([a-f0-9]{64})/);
    assert.ok(tokenMatch, "Reset email should contain a 64-hex-character token");
    const resetToken = tokenMatch[1];

    // 4. Confirm the password reset with a new secret
    const updatedSecret = buildSecret("Updated");
    const confirmRes = await apiRequest("/auth/password-reset/confirm", {
      method: "POST",
      body: { token: resetToken, newPassword: updatedSecret },
    });
    assert.equal(confirmRes.status, 204);

    // 5. Reusing the same reset token must fail
    const replayRes = await apiRequest("/auth/password-reset/confirm", {
      method: "POST",
      body: { token: resetToken, newPassword: buildSecret("Another") },
    });
    assert.equal(replayRes.status, 400);
    assert.equal(replayRes.body.error, "INVALID_RESET_TOKEN");

    // 6. Temporary password no longer works; new secret works and clears mustChangePassword
    const oldLoginRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { email: hikerEmail, password: tempPassword },
    });
    assert.equal(oldLoginRes.status, 401);

    const newLoginRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { email: hikerEmail, password: updatedSecret },
    });
    assert.equal(newLoginRes.status, 200);
    const newCookie = newLoginRes.headers.get("set-cookie")?.split(";")[0];

    const meAfterReset = await apiRequest("/auth/me", { cookie: newCookie });
    assert.equal(meAfterReset.status, 200);
    assert.equal(meAfterReset.body.mustChangePassword, false);
  });

  it("rolls back the entire transaction on duplicate email or insufficient seats", async (t) => {
    const fixture = createFixture(t);
    const staff = await seedUser(fixture, { role: "employee" });
    const existingHiker = await seedUser(fixture, { role: "hiker" });
    const slotId = await seedFutureSlot(fixture, staff.id, [2]);

    // Duplicate email -> 409 EMAIL_ALREADY_USED and no reservation created
    const dupEmailRes = await apiRequest("/staff/reservations", {
      method: "POST",
      cookie: staffCookie(staff),
      body: {
        slotId,
        partySize: 2,
        newHiker: {
          email: existingHiker.email.toUpperCase(),
          firstName: "Clone",
          lastName: "Hiker",
        },
      },
    });
    assert.equal(dupEmailRes.status, 409);
    assert.equal(dupEmailRes.body.error, "EMAIL_ALREADY_USED");

    // Not enough seats -> 409 NOT_ENOUGH_SEATS and no temporary hiker persisted
    const orphanSurname = `Rollback_${randomUUID().slice(0, 8)}`;
    const noSeatsRes = await apiRequest("/staff/reservations", {
      method: "POST",
      cookie: staffCookie(staff),
      body: {
        slotId,
        partySize: 6,
        temporaryHiker: {
          firstName: "Ghost",
          lastName: orphanSurname,
        },
      },
    });
    assert.equal(noSeatsRes.status, 409);
    assert.equal(noSeatsRes.body.error, "NOT_ENOUGH_SEATS");

    const { rows: orphanUsers } = await pool.query(
      "SELECT id FROM app_user WHERE last_name = $1",
      [orphanSurname],
    );
    assert.equal(orphanUsers.length, 0);

    const { rows: slotReservations } = await pool.query(
      "SELECT id FROM reservation WHERE slot_id = $1",
      [slotId],
    );
    assert.equal(slotReservations.length, 0);
  });
});