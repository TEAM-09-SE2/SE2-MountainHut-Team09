import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import emailSender from "../../../src/emails/emailSender.js";
import { ConflictError, ErrorClass, NotFoundError } from "../../../src/errors/ErrorClass.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import reservationService from "../../../src/services/reservation.service.js";

const TEST_EMAIL_PATTERN = "cancel-integration-%";
const TEMPORARY_LAST_NAME = "CancelIntegrationTemporary";
const HOUR = 60 * 60 * 1000;
let ada;
let grace;
let giulia;
let sendMock;

async function purgeTestData() {
  const testUsers = "SELECT id FROM app_user WHERE email LIKE $1 OR last_name = $2";
  const params = [TEST_EMAIL_PATTERN, TEMPORARY_LAST_NAME];
  await pool.query(`DELETE FROM reservation WHERE hiker_id IN (${testUsers}) OR slot_id IN (SELECT id FROM slot WHERE created_by IN (${testUsers}))`, params);
  await pool.query(`DELETE FROM slot WHERE created_by IN (${testUsers})`, params);
  await pool.query("DELETE FROM app_user WHERE email LIKE $1 OR last_name = $2", params);
}

async function createUser(role, firstName, lastName) {
  const email = `cancel-integration-${randomUUID()}@example.com`;
  const { rows: [user] } = await pool.query(
    "INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [email, "not-a-real-password-hash", "not-a-real-salt", firstName, lastName, role],
  );
  return { id: user.id, email, firstName, lastName, role };
}

async function createSlot(startAt, endAt, seatsByTable = { 1: 4, 2: 2 }) {
  const { rows: [slot] } = await pool.query("INSERT INTO slot (start_at, end_at, created_by) VALUES ($1, $2, $3) RETURNING id", [startAt, endAt, giulia.id]);
  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    await pool.query("INSERT INTO slot_table (slot_id, table_number, seats) VALUES ($1, $2, $3)", [slot.id, tableNumber, seats]);
  }
  return slot.id;
}

async function book(hiker, slotId, partySize, requirements = []) {
  const confirmationMock = mock.method(confirmationEmailService, "sendBookingConfirmation", async () => false);
  const booking = await reservationService.createReservation(hiker.id, slotId, partySize, requirements);
  confirmationMock.mock.restore();
  return booking;
}

async function insertBooking(hikerId, slotId, partySize) {
  const { rows: [reservation] } = await pool.query(
    "INSERT INTO reservation (hiker_id, slot_id, party_size) VALUES ($1, $2, $3) RETURNING id",
    [hikerId, slotId, partySize],
  );
  const { rows: [table] } = await pool.query("SELECT id FROM slot_table WHERE slot_id = $1 ORDER BY table_number LIMIT 1", [slotId]);
  await pool.query(
    "INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats) VALUES ($1, $2, $3, $4)",
    [reservation.id, table.id, slotId, partySize],
  );
  return reservation.id;
}

async function storedBooking(id) {
  const { rows: [row] } = await pool.query(
    "SELECT slot_id, party_size, status, cancelled_at, cancelled_by, updated_at FROM reservation WHERE id = $1",
    [id],
  );
  return row;
}

const seatRows = async (id) =>
  (await pool.query("SELECT slot_table_id, slot_id, seats FROM reservation_seat WHERE reservation_id = $1 ORDER BY slot_table_id", [id])).rows;

const requirementRows = async (id) =>
  (await pool.query("SELECT id, people_count, has_allergies, description FROM reservation_requirement WHERE reservation_id = $1 ORDER BY id", [id])).rows;

const freeSeats = async (slotId) =>
  Number((await pool.query("SELECT COALESCE(SUM(free_seats), 0) AS free FROM slot_table_free WHERE slot_id = $1", [slotId])).rows[0].free);

const cancellerOf = (user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });

function assertError(error, ErrorType, statusCode, code) {
  assert.ok(error instanceof ErrorType, `unexpected error: ${error?.code ?? error}`);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

async function assertServiceError(promise, ErrorType, statusCode, code) {
  await assert.rejects(promise, (error) => {
    assertError(error, ErrorType, statusCode, code);
    return true;
  });
}

function pauseAfter(name) {
  const original = reservationRepository[name];
  let resume;
  let reached;
  const state = {
    pid: null,
    reached: new Promise((resolve) => { reached = resolve; }),
    resume: () => resume(),
  };
  const gate = new Promise((resolve) => { resume = resolve; });
  let paused = false;
  mock.method(reservationRepository, name, async (client, ...args) => {
    const result = await original(client, ...args);
    if (!paused) {
      paused = true;
      state.pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      reached();
      await gate;
    }
    return result;
  });
  return state;
}

async function waitUntilBlockedBy(pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows: [{ waiting }] } = await pool.query(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
      [pid],
    );
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No query waited for backend ${pid}`);
}

before(async () => {
  await purgeTestData();
  ada = await createUser("hiker", "Ada", "Lovelace");
  grace = await createUser("hiker", "Grace", "Hopper");
  giulia = await createUser("employee", "Giulia", "Bianchi");
});

beforeEach(() => {
  sendMock = mock.method(emailSender, "send", async () => {});
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

describe("cancel a booking repository and service integration (MH-08)", () => {
  // Uses PostgreSQL to verify the hiker's cancellation sets status, cancelled_at and cancelled_by and returns them as stored.
  it("marks the hiker's booking as cancelled, by the hiker, and returns what was stored", async () => {
    const slotId = await createSlot("2091-03-10T12:00:00+01:00", "2091-03-10T14:00:00+01:00");
    const booking = await book(ada, slotId, 3);
    const before = Date.now();

    const result = await reservationService.cancelBooking(booking.id, ada.id);
    const stored = await storedBooking(booking.id);

    assert.deepEqual(result, {
      id: booking.id,
      slotId,
      startAt: new Date("2091-03-10T11:00:00.000Z"),
      partySize: 3,
      status: "cancelled",
      cancelledAt: stored.cancelled_at,
      cancelledBy: cancellerOf(ada),
      confirmationSent: true,
    });
    assert.equal(stored.status, "cancelled");
    assert.equal(stored.cancelled_by, ada.id);
    assert.ok(Math.abs(stored.cancelled_at.getTime() - before) < 60 * 1000);
    assert.equal(stored.slot_id, slotId);
    assert.equal(stored.party_size, 3);
  });

  // Uses PostgreSQL to verify nothing is deleted: the seat and requirement rows stay as history.
  it("keeps the seat and requirement rows of the cancelled booking", async () => {
    const slotId = await createSlot("2091-03-11T12:00:00+01:00", "2091-03-11T14:00:00+01:00");
    const booking = await book(ada, slotId, 5, [
      { peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
      { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
    ]);
    const seatsBefore = await seatRows(booking.id);
    const requirementsBefore = await requirementRows(booking.id);

    await reservationService.cancelBooking(booking.id, ada.id);

    assert.equal(seatsBefore.length, 2);
    assert.equal(requirementsBefore.length, 2);
    assert.deepEqual(await seatRows(booking.id), seatsBefore);
    assert.deepEqual(await requirementRows(booking.id), requirementsBefore);
  });

  // Uses PostgreSQL to verify the seats are free at once and another hiker can take them.
  it("frees the seats at once for other guests", async () => {
    const slotId = await createSlot("2091-03-12T12:00:00+01:00", "2091-03-12T14:00:00+01:00", { 1: 4 });
    const booking = await book(ada, slotId, 4);
    await assertServiceError(book(grace, slotId, 2), ConflictError, 409, "NOT_ENOUGH_SEATS");

    await reservationService.cancelBooking(booking.id, ada.id);
    const freeAfterCancel = await freeSeats(slotId);
    const graceBooking = await book(grace, slotId, 4);

    assert.equal(freeAfterCancel, 4);
    assert.equal(graceBooking.status, "confirmed");
    assert.equal(await freeSeats(slotId), 0);
  });

  // Uses PostgreSQL to verify the hiker can book the same slot again after cancelling.
  it("lets the hiker book the same slot again", async () => {
    const slotId = await createSlot("2091-03-13T12:00:00+01:00", "2091-03-13T14:00:00+01:00");
    const booking = await book(ada, slotId, 2);
    await assertServiceError(book(ada, slotId, 1), ConflictError, 409, "ALREADY_BOOKED");

    await reservationService.cancelBooking(booking.id, ada.id);
    const again = await book(ada, slotId, 2);

    assert.notEqual(again.id, booking.id);
    assert.equal(again.status, "confirmed");
    assert.equal((await storedBooking(booking.id)).status, "cancelled");
  });

  // Uses PostgreSQL to verify a booking of another hiker is answered 404 RESERVATION_NOT_FOUND and stays confirmed.
  it("answers 404 RESERVATION_NOT_FOUND for another hiker's booking and changes nothing", async () => {
    const slotId = await createSlot("2091-03-14T12:00:00+01:00", "2091-03-14T14:00:00+01:00");
    const booking = await book(ada, slotId, 2);

    await assertServiceError(reservationService.cancelBooking(booking.id, grace.id), NotFoundError, 404, "RESERVATION_NOT_FOUND");

    assert.deepEqual(await storedBooking(booking.id), { slot_id: slotId, party_size: 2, status: "confirmed", cancelled_at: null, cancelled_by: null, updated_at: null });
    assert.equal(await freeSeats(slotId), 4);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Uses PostgreSQL to verify a booking id that does not exist is answered 404 RESERVATION_NOT_FOUND.
  it("answers 404 RESERVATION_NOT_FOUND for a booking that does not exist", async () => {
    await assertServiceError(reservationService.cancelBooking(2147483647, ada.id), NotFoundError, 404, "RESERVATION_NOT_FOUND");
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Uses PostgreSQL to verify a second cancellation is refused with 409 and keeps the first cancellation's time and canceller.
  it("answers 409 RESERVATION_CANCELLED to a second cancellation and keeps the first one", async () => {
    const slotId = await createSlot("2091-03-15T12:00:00+01:00", "2091-03-15T14:00:00+01:00");
    const booking = await book(ada, slotId, 2);
    await reservationService.cancelBooking(booking.id, ada.id);
    const first = await storedBooking(booking.id);

    await assertServiceError(reservationService.cancelBooking(booking.id, ada.id), ConflictError, 409, "RESERVATION_CANCELLED");

    assert.deepEqual(await storedBooking(booking.id), first);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  // Uses PostgreSQL to verify a cancelled booking can no longer be changed (MH-06).
  it("refuses to change a cancelled booking", async () => {
    const slotId = await createSlot("2091-03-16T12:00:00+01:00", "2091-03-16T14:00:00+01:00");
    const booking = await book(ada, slotId, 2);
    await reservationService.cancelBooking(booking.id, ada.id);

    await assertServiceError(reservationService.changeBooking(ada.id, booking.id, { partySize: 3 }), ConflictError, 409, "RESERVATION_CANCELLED");

    assert.equal((await storedBooking(booking.id)).party_size, 2);
  });

  // Uses PostgreSQL to verify a booking can be cancelled while its slot is in progress, freeing its seats.
  it("cancels a booking while its slot is in progress", async () => {
    const slotId = await createSlot(new Date(Date.now() - 10 * 60 * 1000), new Date(Date.now() + 50 * 60 * 1000));
    const bookingId = await insertBooking(ada.id, slotId, 2);

    const result = await reservationService.cancelBooking(bookingId, ada.id);

    assert.equal(result.status, "cancelled");
    assert.equal((await storedBooking(bookingId)).status, "cancelled");
    assert.equal(await freeSeats(slotId), 6);
  });

  // Uses PostgreSQL to verify a booking whose slot has ended is refused with 422 SLOT_ENDED and stays confirmed.
  it("answers 422 SLOT_ENDED for a booking whose slot has ended and changes nothing", async () => {
    const slotId = await createSlot(new Date(Date.now() - 3 * HOUR), new Date(Date.now() - 2 * HOUR));
    const bookingId = await insertBooking(ada.id, slotId, 2);

    await assertServiceError(reservationService.cancelBooking(bookingId, ada.id), ErrorClass, 422, "SLOT_ENDED");

    assert.equal((await storedBooking(bookingId)).status, "confirmed");
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Uses PostgreSQL to verify the email is built from the stored booking: reference, slot in the hut's time, party size and requirements.
  it("emails the hiker the details of the cancelled booking", async () => {
    const slotId = await createSlot("2091-07-20T12:00:00+02:00", "2091-07-20T13:30:00+02:00");
    const booking = await book(ada, slotId, 3, [{ peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" }]);

    await reservationService.cancelBooking(booking.id, ada.id);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(message.to, ada.email);
    assert.equal(message.subject, `Booking cancelled – MH-${booking.id}`);
    assert.match(message.text, /Your reservation has been cancelled/);
    assert.match(message.text, /Hello, Ada Lovelace!/);
    assert.match(message.text, /Date & Time\s+20 July 2091 - from 12:00 to 13:30/);
    assert.match(message.text, /Party size\s+3 people/);
    assert.match(message.text, /1 × ALLERGY: Shellfish allergy/);
  });

  // Uses PostgreSQL to verify a failed email never undoes the cancellation.
  it("keeps the cancellation and answers confirmationSent false when the email fails", async () => {
    const slotId = await createSlot("2091-03-20T12:00:00+01:00", "2091-03-20T14:00:00+01:00");
    const booking = await book(ada, slotId, 2);
    sendMock.mock.mockImplementation(async () => { throw new Error("SMTP unavailable"); });
    mock.method(console, "error", () => {});

    const result = await reservationService.cancelBooking(booking.id, ada.id);

    assert.equal(result.status, "cancelled");
    assert.equal(result.confirmationSent, false);
    assert.equal((await storedBooking(booking.id)).status, "cancelled");
    assert.equal(await freeSeats(slotId), 6);
  });

  // Uses PostgreSQL to verify the hiker's list shows the cancelled booking as not cancellable, with its cancellation time.
  it("shows the cancelled booking in the hiker's list as no longer cancellable", async () => {
    const slotId = await createSlot("2091-03-21T12:00:00+01:00", "2091-03-21T14:00:00+01:00");
    const booking = await book(grace, slotId, 2);
    const before = (await reservationService.getMyReservations(grace.id)).find((item) => item.id === booking.id);

    const result = await reservationService.cancelBooking(booking.id, grace.id);
    const listed = (await reservationService.getMyReservations(grace.id)).find((item) => item.id === booking.id);

    assert.equal(before.cancellable, true);
    assert.equal(listed.status, "cancelled");
    assert.equal(listed.cancellable, false);
    assert.equal(listed.changeable, false);
    assert.deepEqual(listed.cancelledAt, result.cancelledAt);
  });

  // Uses PostgreSQL to verify the staff list shows when the hiker cancelled the booking and that the hiker is the canceller, and still lists its tables.
  it("shows the cancellation time and the hiker as canceller in the staff list", async () => {
    const slotId = await createSlot("2091-03-22T12:00:00+01:00", "2091-03-22T14:00:00+01:00");
    const booking = await book(ada, slotId, 2);

    const result = await reservationService.cancelBooking(booking.id, ada.id);
    const listed = await reservationService.getStaffReservations({ date: "2091-03-22", status: "cancelled" });
    const [cancelled] = listed.filter((item) => item.id === booking.id);

    assert.equal(cancelled.status, "cancelled");
    assert.deepEqual(cancelled.cancelledAt, result.cancelledAt);
    assert.deepEqual(cancelled.cancelledBy, cancellerOf(ada));
    assert.deepEqual(cancelled.tables, booking.tables);
  });
});

describe("cancel a booking concurrency on PostgreSQL (MH-08)", () => {
  // Uses PostgreSQL to verify two cancellations of the same booking run one after the other: the first wins, the second gets 409.
  it("lets only the first of two simultaneous cancellations succeed", async () => {
    const slotId = await createSlot("2091-04-10T12:00:00+02:00", "2091-04-10T14:00:00+02:00");
    const booking = await book(ada, slotId, 2);
    const firstHolds = pauseAfter("cancelReservation");

    const first = reservationService.cancelBooking(booking.id, ada.id);
    await firstHolds.reached;
    const second = reservationService.cancelBooking(booking.id, ada.id);
    await waitUntilBlockedBy(firstHolds.pid);
    firstHolds.resume();

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    assert.equal(firstResult.value.status, "cancelled");
    assertError(secondResult.reason, ConflictError, 409, "RESERVATION_CANCELLED");
    assert.equal((await storedBooking(booking.id)).cancelled_by, ada.id);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  // Uses PostgreSQL to verify a change (MH-06) that waits for a cancellation of the same booking is refused once the cancellation commits.
  it("refuses a change that waited for the cancellation of the same booking", async () => {
    const slotId = await createSlot("2091-04-11T12:00:00+02:00", "2091-04-11T14:00:00+02:00");
    const otherSlotId = await createSlot("2091-04-12T12:00:00+02:00", "2091-04-12T14:00:00+02:00");
    const booking = await book(ada, slotId, 2);
    mock.method(confirmationEmailService, "sendBookingUpdate", async () => false);
    const cancelHolds = pauseAfter("cancelReservation");

    const cancel = reservationService.cancelBooking(booking.id, ada.id);
    await cancelHolds.reached;
    const change = reservationService.changeBooking(ada.id, booking.id, { slotId: otherSlotId });
    await waitUntilBlockedBy(cancelHolds.pid);
    cancelHolds.resume();

    const [cancelResult, changeResult] = await Promise.allSettled([cancel, change]);

    assert.equal(cancelResult.value.status, "cancelled");
    assertError(changeResult.reason, ConflictError, 409, "RESERVATION_CANCELLED");
    assert.equal((await storedBooking(booking.id)).slot_id, slotId);
    assert.equal(await freeSeats(otherSlotId), 6);
  });

  // Uses PostgreSQL to verify a cancellation that waits for a change of party size cancels the changed booking.
  it("cancels the booking after a party-size change it waited for", async () => {
    const slotId = await createSlot("2091-04-13T12:00:00+02:00", "2091-04-13T14:00:00+02:00");
    const booking = await book(ada, slotId, 2);
    mock.method(confirmationEmailService, "sendBookingUpdate", async () => false);
    const changeHolds = pauseAfter("getReservationState");

    const change = reservationService.changeBooking(ada.id, booking.id, { partySize: 3 });
    await changeHolds.reached;
    const cancel = reservationService.cancelBooking(booking.id, ada.id);
    await waitUntilBlockedBy(changeHolds.pid);
    changeHolds.resume();

    const [changeResult, cancelResult] = await Promise.allSettled([change, cancel]);

    assert.equal(changeResult.value.partySize, 3);
    assert.equal(cancelResult.status, "fulfilled", `cancel failed: ${cancelResult.reason?.code ?? cancelResult.reason}`);
    assert.equal(cancelResult.value.status, "cancelled");
    assert.equal(cancelResult.value.partySize, 3);
    assert.equal((await storedBooking(booking.id)).status, "cancelled");
    assert.equal(await freeSeats(slotId), 6);
  });

  // Uses PostgreSQL to verify a cancellation that waits for a change of slot (MH-06) cancels the booking in its new slot instead of answering 404.
  it("cancels the booking after a slot change it waited for", async () => {
    const slotId = await createSlot("2091-04-14T12:00:00+02:00", "2091-04-14T14:00:00+02:00");
    const newSlotId = await createSlot("2091-04-15T12:00:00+02:00", "2091-04-15T14:00:00+02:00");
    const booking = await book(ada, slotId, 2);
    mock.method(confirmationEmailService, "sendBookingUpdate", async () => false);
    const changeHolds = pauseAfter("getReservationState");

    const change = reservationService.changeBooking(ada.id, booking.id, { slotId: newSlotId });
    await changeHolds.reached;
    const cancel = reservationService.cancelBooking(booking.id, ada.id);
    await waitUntilBlockedBy(changeHolds.pid);
    changeHolds.resume();

    const [changeResult, cancelResult] = await Promise.allSettled([change, cancel]);
    const stored = await storedBooking(booking.id);

    assert.equal(changeResult.value.slotId, newSlotId);
    assert.equal(cancelResult.status, "fulfilled", `cancel failed: ${cancelResult.reason?.code ?? cancelResult.reason}`);
    assert.equal(cancelResult.value.status, "cancelled");
    assert.equal(cancelResult.value.slotId, newSlotId);
    assert.equal(stored.status, "cancelled");
    assert.equal(stored.slot_id, newSlotId);
    assert.equal(await freeSeats(newSlotId), 6);
  });
});
