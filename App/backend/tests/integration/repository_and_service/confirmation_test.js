import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import emailSender from "../../../src/emails/emailSender.js";
import { ConflictError, ErrorClass } from "../../../src/errors/ErrorClass.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import reservationService from "../../../src/services/reservation.service.js";

const TEST_EMAIL_PATTERN = "confirmation-integration-%";
const MISSING_RESERVATION_ID = 2147483647;
let hiker;

async function purgeTestData() {
  const testUsers = "SELECT id FROM app_user WHERE email LIKE $1";
  await pool.query(`DELETE FROM reservation WHERE hiker_id IN (${testUsers}) OR slot_id IN (SELECT id FROM slot WHERE created_by IN (${testUsers}))`, [TEST_EMAIL_PATTERN]);
  await pool.query(`DELETE FROM slot WHERE created_by IN (${testUsers})`, [TEST_EMAIL_PATTERN]);
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_PATTERN]);
}

async function createHiker(firstName, lastName) {
  const email = `confirmation-integration-${randomUUID()}@example.com`;
  const { rows: [user] } = await pool.query(
    "INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, 'hiker') RETURNING id",
    [email, "not-a-real-password-hash", "not-a-real-salt", firstName, lastName],
  );
  return { id: user.id, email };
}

async function createSlot(startAt, endAt, seatsByTable) {
  const { rows: [slot] } = await pool.query("INSERT INTO slot (start_at, end_at, created_by) VALUES ($1, $2, $3) RETURNING id", [startAt, endAt, hiker.id]);

  const tableIds = {};
  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    const { rows: [table] } = await pool.query("INSERT INTO slot_table (slot_id, table_number, seats) VALUES ($1, $2, $3) RETURNING id", [slot.id, tableNumber, seats]);
    tableIds[tableNumber] = table.id;
  }

  return { id: slot.id, tableIds };
}

async function insertReservation(hikerId, slot, seatsByTable) {
  const partySize = Object.values(seatsByTable).reduce((total, seats) => total + seats, 0);
  const { rows: [reservation] } = await pool.query("INSERT INTO reservation (hiker_id, slot_id, party_size) VALUES ($1, $2, $3) RETURNING id", [hikerId, slot.id, partySize]);

  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    await pool.query("INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats) VALUES ($1, $2, $3, $4)", [reservation.id, slot.tableIds[tableNumber], slot.id, seats]);
  }

  return reservation.id;
}

async function findReservation(id) {
  const { rows } = await pool.query("SELECT status, party_size, confirmation_sent_at FROM reservation WHERE id = $1", [id]);
  return rows[0];
}

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function assertSavedNow(timestamp) {
  assert.ok(timestamp instanceof Date);
  assert.ok(Math.abs(timestamp.getTime() - Date.now()) < 60 * 1000);
}

before(async () => {
  await purgeTestData();
  hiker = await createHiker("Ada", "Lovelace");
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  try {
    await purgeTestData();
  } finally {
    await pool.end();
  }
});

describe("confirmation repository and service integration", () => {
  // Verifies getConfirmationData reads the hiker and the slot of a stored booking as one record, also for a party split over two tables.
  it("returns the hiker, the party size and the slot of a booking from getConfirmationData", async () => {
    const slot = await createSlot("2097-12-15T12:00:00+01:00", "2097-12-15T14:00:00+01:00", { 1: 4, 2: 2 });
    const reservationId = await insertReservation(hiker.id, slot, { 1: 4, 2: 1 });

    const data = await reservationRepository.getConfirmationData(reservationId);

    assert.deepEqual(data, {
      id: reservationId,
      partySize: 5,
      email: hiker.email,
      hikerName: "Ada Lovelace",
      startAt: new Date("2097-12-15T12:00:00+01:00"),
      endAt: new Date("2097-12-15T14:00:00+01:00"),
    });
    assert.equal(await reservationRepository.getConfirmationData(MISSING_RESERVATION_ID), null);
  });

  // Verifies markConfirmationSent saves the current time on that booking only.
  it("saves confirmation_sent_at on the given booking only", async () => {
    const slot = await createSlot("2097-12-16T12:00:00+01:00", "2097-12-16T13:00:00+01:00", { 1: 4 });
    const marked = await insertReservation(hiker.id, slot, { 1: 2 });
    const other = await insertReservation(hiker.id, slot, { 1: 1 });

    await reservationRepository.markConfirmationSent(marked);

    assertSavedNow((await findReservation(marked)).confirmation_sent_at);
    assert.equal((await findReservation(other)).confirmation_sent_at, null);
  });

  // Verifies a stored booking is emailed once to its hiker with the details read from the database, and confirmation_sent_at is saved.
  it("emails the hiker of a stored booking and saves confirmation_sent_at", async () => {
    const slot = await createSlot("2097-12-17T12:00:00+01:00", "2097-12-17T14:00:00+01:00", { 1: 4, 2: 2 });
    const reservationId = await insertReservation(hiker.id, slot, { 1: 4, 2: 1 });
    const sendMock = mock.method(emailSender, "send", async () => {});

    const result = await confirmationEmailService.sendBookingConfirmation(reservationId);
    const message = sendMock.mock.calls[0].arguments[0];
    const html = visibleText(message.html);

    assert.equal(result, true);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(message.to, hiker.email);
    assert.equal(message.subject, `Booking confirmed – MH-${reservationId}`);
    assert.match(html, /Hello, Ada Lovelace!/);
    assert.match(html, new RegExp(`Booking Reference MH-${reservationId} `));
    assert.match(html, /Date & Time 17 December 2097 - from 12:00 to 14:00 /);
    assert.match(html, /Party size 5 people /);
    assert.doesNotMatch(html, /table/i);
    assert.match(message.text, /Date & Time\s+17 December 2097 - from 12:00 to 14:00/);
    assert.doesNotMatch(message.text, /table/i);
    assertSavedNow((await findReservation(reservationId)).confirmation_sent_at);
  });

  // Verifies slot times stored in the database are shown in the hut's time in summer (UTC+2) as well as in winter (UTC+1).
  it("shows a summer slot from the database in the hut's summer time", async () => {
    const slot = await createSlot("2097-07-20T12:00:00+02:00", "2097-07-20T13:30:00+02:00", { 1: 4 });
    const reservationId = await insertReservation(hiker.id, slot, { 1: 2 });
    const sendMock = mock.method(emailSender, "send", async () => {});

    await confirmationEmailService.sendBookingConfirmation(reservationId);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.match(visibleText(message.html), /Date & Time 20 July 2097 - from 12:00 to 13:30 /);
    assert.match(message.text, /Date & Time\s+20 July 2097 - from 12:00 to 13:30/);
  });

  // Verifies an email that cannot be sent leaves confirmation_sent_at NULL, so the booking can be found as not confirmed by email.
  it("keeps confirmation_sent_at NULL when the email cannot be sent", async () => {
    const slot = await createSlot("2097-12-18T12:00:00+01:00", "2097-12-18T13:00:00+01:00", { 1: 4 });
    const reservationId = await insertReservation(hiker.id, slot, { 1: 2 });
    mock.method(emailSender, "send", async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1025"); });
    mock.method(console, "error", () => {});

    const result = await confirmationEmailService.sendBookingConfirmation(reservationId);

    assert.equal(result, false);
    assert.equal((await findReservation(reservationId)).confirmation_sent_at, null);
  });

  // Verifies no email is sent for a reservation id that is not in the database.
  it("sends no email for a reservation that does not exist", async () => {
    const sendMock = mock.method(emailSender, "send", async () => {});

    const result = await confirmationEmailService.sendBookingConfirmation(MISSING_RESERVATION_ID);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Verifies a new booking is emailed to the hiker who made it only once it is committed, and is returned with confirmationSent true.
  it("emails a new booking after it is committed and returns confirmationSent true", async () => {
    const booker = await createHiker("Grace", "Hopper");
    const slot = await createSlot("2097-12-19T19:00:00+01:00", "2097-12-19T21:00:00+01:00", { 1: 4, 2: 2 });
    let visibleWhenSent;
    const sendMock = mock.method(emailSender, "send", async () => {
      const { rows } = await pool.query("SELECT id FROM reservation WHERE hiker_id = $1 AND slot_id = $2", [booker.id, slot.id]);
      visibleWhenSent = rows.length;
    });

    const result = await reservationService.createReservation(booker.id, slot.id, 3);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.equal(result.confirmationSent, true);
    assert.equal(result.status, "confirmed");
    assert.equal(visibleWhenSent, 1);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(message.to, booker.email);
    assert.equal(message.subject, `Booking confirmed – MH-${result.id}`);
    assert.match(visibleText(message.html), /Hello, Grace Hopper!/);
    assert.match(visibleText(message.html), /Date & Time 19 December 2097 - from 19:00 to 21:00 /);
    assert.match(visibleText(message.html), /Party size 3 people /);
    assertSavedNow((await findReservation(result.id)).confirmation_sent_at);
  });

  // Verifies a new booking whose email fails stays saved with its seats, is returned with confirmationSent false and keeps confirmation_sent_at NULL.
  it("keeps a new booking with confirmationSent false when its email cannot be sent", async () => {
    const slot = await createSlot("2097-12-20T12:00:00+01:00", "2097-12-20T13:00:00+01:00", { 1: 4, 2: 2 });
    mock.method(emailSender, "send", async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1025"); });
    mock.method(console, "error", () => {});

    const result = await reservationService.createReservation(hiker.id, slot.id, 6);
    const { rows: seats } = await pool.query("SELECT slot_table_id, seats FROM reservation_seat WHERE reservation_id = $1 ORDER BY slot_table_id", [result.id]);

    assert.equal(result.confirmationSent, false);
    assert.deepEqual(result.tables, [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }]);
    assert.deepEqual(await findReservation(result.id), { status: "confirmed", party_size: 6, confirmation_sent_at: null });
    assert.deepEqual(seats, [{ slot_table_id: slot.tableIds[1], seats: 4 }, { slot_table_id: slot.tableIds[2], seats: 2 }]);
  });

  // Verifies a booking refused for a full slot, a second booking in the same slot or a past slot sends no email.
  it("sends no email when the booking is refused", async () => {
    const slot = await createSlot("2097-12-21T12:00:00+01:00", "2097-12-21T13:00:00+01:00", { 1: 4 });
    const pastSlot = await createSlot("2002-12-21T12:00:00+01:00", "2002-12-21T13:00:00+01:00", { 1: 4 });
    await insertReservation(hiker.id, slot, { 1: 1 });
    const other = await createHiker("Grace", "Hopper");
    const sendMock = mock.method(emailSender, "send", async () => {});

    await assert.rejects(reservationService.createReservation(other.id, slot.id, 4), (error) => error instanceof ConflictError && error.code === "NOT_ENOUGH_SEATS");
    await assert.rejects(reservationService.createReservation(hiker.id, slot.id, 1), (error) => error instanceof ConflictError && error.code === "ALREADY_BOOKED");
    await assert.rejects(reservationService.createReservation(other.id, pastSlot.id, 1), (error) => error instanceof ErrorClass && error.code === "BOOKING_CLOSED");

    assert.equal(sendMock.mock.callCount(), 0);
  });
});
