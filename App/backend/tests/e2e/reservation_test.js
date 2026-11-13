import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import emailSender from "../../src/emails/emailSender.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "reservation-e2e-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
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
});

async function createUser(fixture, { role = "hiker", firstName = "Ada" } = {}) {
  const email = `reservation-e2e-${randomUUID()}@example.com`;
  const { salt, hash } = hashPassword("password123");
  const { rows: [user] } = await pool.query(
    `INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, 'Lovelace', $5)
     RETURNING id`,
    [email, hash, salt, firstName, role],
  );
  fixture.userIds.push(user.id);
  return { id: user.id, email, firstName, role };
}

async function createSlot(fixture, createdBy, startAt, endAt, tableCapacities) {
  const { rows: [slot] } = await pool.query(
    `INSERT INTO slot (start_at, end_at, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [startAt, endAt, createdBy],
  );
  fixture.slotIds.push(slot.id);
  const tables = [];

  for (const [tableNumber, seats] of tableCapacities.entries()) {
    const { rows: [table] } = await pool.query(
      `INSERT INTO slot_table (slot_id, table_number, seats)
       VALUES ($1, $2, $3)
       RETURNING id, table_number`,
      [slot.id, tableNumber + 1, seats],
    );
    tables.push({ id: table.id, tableNumber: table.table_number, seats });
  }

  return { id: slot.id, startAt: new Date(startAt).toISOString(), tables };
}

async function createBooking(fixture, {
  hikerId,
  slot,
  partySize,
  tableSeats = [partySize],
  requirements = [],
  status = "confirmed",
}) {
  const cancelledFields = status === "cancelled"
    ? ", cancelled_at, cancelled_by"
    : "";
  const cancelledValues = status === "cancelled" ? ", NOW(), $5" : "";
  const values = [hikerId, slot.id, partySize, status];
  if (status === "cancelled") values.push(hikerId);

  const { rows: [booking] } = await pool.query(
    `INSERT INTO reservation (hiker_id, slot_id, party_size, status${cancelledFields})
     VALUES ($1, $2, $3, $4${cancelledValues})
     RETURNING id`,
    values,
  );

  for (let index = 0; index < tableSeats.length; index += 1) {
    const table = slot.tables[index];
    await pool.query(
      `INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats)
       VALUES ($1, $2, $3, $4)`,
      [booking.id, table.id, slot.id, tableSeats[index]],
    );
  }

  for (const requirement of requirements) {
    await pool.query(
      `INSERT INTO reservation_requirement
        (reservation_id, people_count, has_allergies, description)
       VALUES ($1, $2, $3, $4)`,
      [
        booking.id,
        requirement.peopleCount,
        requirement.hasAllergies,
        requirement.description,
      ],
    );
  }

  return booking.id;
}

async function cleanup(fixture) {
  await pool.query(
    `DELETE FROM reservation
     WHERE hiker_id = ANY($1::int[]) OR slot_id = ANY($2::int[])`,
    [fixture.userIds, fixture.slotIds],
  );
  await pool.query("DELETE FROM slot WHERE id = ANY($1::int[])", [fixture.slotIds]);
  await pool.query("DELETE FROM app_user WHERE id = ANY($1::int[])", [fixture.userIds]);
}

function loginCookie(user) {
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: "Lovelace",
      role: user.role,
    },
    testJwtSecret,
    { expiresIn: "1d" },
  );
  return `token=${token}`;
}

async function sendRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("reservation end-to-end", () => {
  it("lists only the hiker's active and upcoming bookings with requirements and changeability", async (t) => {
    const fixture = { userIds: [], slotIds: [] };
    t.after(() => cleanup(fixture));
    const owner = await createUser(fixture);
    const otherHiker = await createUser(fixture, { firstName: "Grace" });

    const upcoming = await createSlot(
      fixture,
      owner.id,
      "2099-12-15T11:00:00.000Z",
      "2099-12-15T13:00:00.000Z",
      [4],
    );
    const current = await createSlot(
      fixture,
      owner.id,
      new Date(Date.now() - 30 * 60 * 1000),
      new Date(Date.now() + 30 * 60 * 1000),
      [2],
    );
    const cancelled = await createSlot(
      fixture,
      owner.id,
      "2099-12-16T11:00:00.000Z",
      "2099-12-16T13:00:00.000Z",
      [2],
    );
    const past = await createSlot(
      fixture,
      owner.id,
      "2020-12-15T11:00:00.000Z",
      "2020-12-15T13:00:00.000Z",
      [2],
    );
    const otherBooking = await createSlot(
      fixture,
      otherHiker.id,
      "2099-12-17T11:00:00.000Z",
      "2099-12-17T13:00:00.000Z",
      [2],
    );

    await createBooking(fixture, {
      hikerId: owner.id,
      slot: upcoming,
      partySize: 2,
      tableSeats: [2],
      requirements: [{ peopleCount: 1, hasAllergies: true, description: "Peanuts" }],
    });
    await createBooking(fixture, { hikerId: owner.id, slot: current, partySize: 1 });
    await createBooking(fixture, {
      hikerId: owner.id,
      slot: cancelled,
      partySize: 1,
      status: "cancelled",
    });
    await createBooking(fixture, { hikerId: owner.id, slot: past, partySize: 1 });
    await createBooking(fixture, { hikerId: otherHiker.id, slot: otherBooking, partySize: 1 });

    const response = await sendRequest("/me/reservations", {
      cookie: loginCookie(owner),
    });
    const body = await response.json();
    const listed = body;

    assert.equal(response.status, 200);
    assert.equal(listed.length, 3);
    assert.deepEqual(listed.map((reservation) => reservation.slot.id), [
      current.id,
      upcoming.id,
      cancelled.id,
    ]);
    assert.equal(listed[0].changeable, false);
    assert.equal(listed[0].cancellable, true);
    assert.equal(listed[1].changeable, true);
    assert.equal(listed[1].cancellable, true);
    assert.equal(listed[1].requirements[0].description, "Peanuts");
    assert.equal(listed[2].status, "cancelled");
    assert.equal(listed[2].changeable, false);
    assert.equal(listed[2].cancellable, false);
    assert.ok(listed[2].cancelledAt);
    assert.equal(listed.some((reservation) => reservation.slot.id === past.id), false);
    assert.equal(listed.some((reservation) => reservation.slot.id === otherBooking.id), false);
  });

  it("changes a booking, replaces its requirements and sends the update email", async (t) => {
    const fixture = { userIds: [], slotIds: [] };
    t.after(() => cleanup(fixture));
    const owner = await createUser(fixture);
    const currentSlot = await createSlot(
      fixture,
      owner.id,
      "2099-12-15T11:00:00.000Z",
      "2099-12-15T13:00:00.000Z",
      [4],
    );
    const targetSlot = await createSlot(
      fixture,
      owner.id,
      "2099-12-16T11:00:00.000Z",
      "2099-12-16T13:00:00.000Z",
      [3, 3],
    );
    const reservationId = await createBooking(fixture, {
      hikerId: owner.id,
      slot: currentSlot,
      partySize: 3,
      tableSeats: [3],
      requirements: [{ peopleCount: 1, hasAllergies: false, description: "Old requirement" }],
    });
    const messages = [];
    t.mock.method(emailSender, "send", async (message) => messages.push(message));
    const requirements = [
      { peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
      { peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
    ];

    const response = await sendRequest(`/reservations/${reservationId}`, {
      method: "PATCH",
      cookie: loginCookie(owner),
      body: { slotId: targetSlot.id, partySize: 3, requirements },
    });
    const body = await response.json();
    const { rows: [stored] } = await pool.query(
      `SELECT slot_id, party_size, updated_at
       FROM reservation
       WHERE id = $1`,
      [reservationId],
    );
    const { rows: assignedSeats } = await pool.query(
      `SELECT rs.slot_id, rs.seats, st.slot_id AS table_slot_id
       FROM reservation_seat rs
       JOIN slot_table st ON st.id = rs.slot_table_id
       WHERE rs.reservation_id = $1`,
      [reservationId],
    );
    const { rows: storedRequirements } = await pool.query(
      `SELECT people_count, has_allergies, description
       FROM reservation_requirement
       WHERE reservation_id = $1
       ORDER BY id`,
      [reservationId],
    );

    assert.equal(response.status, 200);
    assert.equal(body.id, reservationId);
    assert.equal(body.slotId, targetSlot.id);
    assert.equal(body.partySize, 3);
    assert.equal(body.confirmationSent, true);
    assert.equal(stored.slot_id, targetSlot.id);
    assert.equal(stored.party_size, 3);
    assert.ok(stored.updated_at);
    assert.equal(assignedSeats.reduce((sum, row) => sum + row.seats, 0), 3);
    assert.ok(assignedSeats.every((row) => row.slot_id === targetSlot.id && row.table_slot_id === targetSlot.id));
    assert.deepEqual(storedRequirements, [
      { people_count: 1, has_allergies: true, description: "Peanut allergy" },
      { people_count: 2, has_allergies: false, description: "Vegetarian" },
    ]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, owner.email);
    assert.equal(messages[0].subject, `Booking updated – MH-${reservationId}`);
    assert.match(messages[0].text, /updated/i);
  });

  it("protects booking ownership and refuses cancelled, late, duplicate, or over-capacity changes", async (t) => {
    const fixture = { userIds: [], slotIds: [] };
    t.after(() => cleanup(fixture));
    const owner = await createUser(fixture);
    const otherHiker = await createUser(fixture, { firstName: "Grace" });
    const staff = await createUser(fixture, { role: "employee", firstName: "Staff" });

    const sourceSlot = await createSlot(
      fixture,
      owner.id,
      "2099-12-15T11:00:00.000Z",
      "2099-12-15T13:00:00.000Z",
      [4],
    );
    const nearSlot = await createSlot(
      fixture,
      owner.id,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      new Date(Date.now() + 26 * 60 * 60 * 1000),
      [4],
    );
    const cancelledSlot = await createSlot(
      fixture,
      owner.id,
      "2099-12-18T11:00:00.000Z",
      "2099-12-18T13:00:00.000Z",
      [4],
    );
    const duplicateSlot = await createSlot(
      fixture,
      owner.id,
      "2099-12-19T11:00:00.000Z",
      "2099-12-19T13:00:00.000Z",
      [4],
    );
    const fullSlot = await createSlot(
      fixture,
      owner.id,
      "2099-12-20T11:00:00.000Z",
      "2099-12-20T13:00:00.000Z",
      [2],
    );
    const sourceBooking = await createBooking(fixture, {
      hikerId: owner.id,
      slot: sourceSlot,
      partySize: 2,
      tableSeats: [2],
    });
    const otherBooking = await createBooking(fixture, {
      hikerId: otherHiker.id,
      slot: sourceSlot,
      partySize: 1,
      tableSeats: [1],
    });
    const cancelledBooking = await createBooking(fixture, {
      hikerId: owner.id,
      slot: cancelledSlot,
      partySize: 1,
      status: "cancelled",
    });
    const duplicateBooking = await createBooking(fixture, {
      hikerId: owner.id,
      slot: duplicateSlot,
      partySize: 1,
    });
    await createBooking(fixture, {
      hikerId: otherHiker.id,
      slot: fullSlot,
      partySize: 2,
      tableSeats: [2],
    });

    const consoleErrorMock = t.mock.method(console, "error", () => {});
    const tryChange = (id, body, user = owner) => sendRequest(
      `/reservations/${id}`,
      { method: "PATCH", cookie: loginCookie(user), body },
    );
    const refusals = [
      { response: await tryChange(otherBooking, { partySize: 2 }), status: 404, code: "RESERVATION_NOT_FOUND" },
      { response: await tryChange(cancelledBooking, { partySize: 2 }), status: 409, code: "BOOKING_CANCELLED" },
      { response: await tryChange(sourceBooking, { slotId: nearSlot.id }), status: 422, code: "CHANGE_CLOSED" },
      { response: await tryChange(sourceBooking, { slotId: duplicateSlot.id }), status: 409, code: "ALREADY_BOOKED" },
      { response: await tryChange(sourceBooking, { slotId: fullSlot.id, partySize: 3 }), status: 409, code: "NOT_ENOUGH_SEATS" },
      { response: await tryChange(sourceBooking, { partySize: 2 }, staff), status: 403, code: "FORBIDDEN_ROLE" },
      { response: await sendRequest(`/reservations/${sourceBooking}`, { method: "PATCH", body: { partySize: 2 } }), status: 401, code: "NOT_AUTHENTICATED" },
    ];

    for (const { response, status, code } of refusals) {
      assert.equal(response.status, status);
      assert.equal((await response.json()).error, code);
    }

    const { rows: [unchanged] } = await pool.query(
      "SELECT slot_id, party_size FROM reservation WHERE id = $1",
      [sourceBooking],
    );
    assert.deepEqual(unchanged, { slot_id: sourceSlot.id, party_size: 2 });
    assert.equal(consoleErrorMock.mock.callCount(), refusals.length);
  });
});
