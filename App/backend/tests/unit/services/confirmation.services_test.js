import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import slotRepository from "../../../src/database/slot.repository.js";
import emailSender from "../../../src/emails/emailSender.js";
import { ConflictError, ErrorClass, NotFoundError } from "../../../src/errors/ErrorClass.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import reservationService from "../../../src/services/reservation.service.js";

afterEach(() => {
  mock.reset();
});

const winterBooking = () => ({
  id: 42,
  partySize: 4,
  email: "ada.lovelace@example.com",
  hikerName: "Ada Lovelace",
  startAt: new Date("2026-12-15T11:00:00.000Z"),
  endAt: new Date("2026-12-15T13:00:00.000Z"),
});

function mockDependencies(booking = winterBooking()) {
  return {
    getConfirmationDataMock: mock.method(reservationRepository, "getConfirmationData", async () => booking),
    markConfirmationSentMock: mock.method(reservationRepository, "markConfirmationSent", async () => {}),
    sendMock: mock.method(emailSender, "send", async () => {}),
    consoleErrorMock: mock.method(console, "error", () => {}),
  };
}

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function sentMessage(booking) {
  const { sendMock } = mockDependencies(booking);
  await confirmationEmailService.sendBookingConfirmation(booking.id);
  const message = sendMock.mock.calls[0].arguments[0];
  return { html: visibleText(message.html), text: message.text };
}

const SLOT_START = new Date("2026-12-15T11:00:00.000Z");
const BOOKING_CREATED_AT = new Date("2026-09-01T10:00:00.000Z");

const freeTables = () => [
  { slotTableId: 71, tableNumber: 1, freeSeats: 4 },
  { slotTableId: 72, tableNumber: 2, freeSeats: 2 },
];

const confirmedBooking = () => ({
  id: 31,
  slotId: 7,
  startAt: SLOT_START,
  partySize: 6,
  status: "confirmed",
  requirements: [],
  tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }],
  createdAt: BOOKING_CREATED_AT,
  updatedAt: null,
});

function mockBooking({ emailSent = true } = {}) {
  const calls = [];
  const client = {
    query: mock.fn(async (sql) => {
      calls.push(sql);
      if (sql.includes("SELECT created_at, updated_at FROM reservation")) {
        return {
          rows: [{ created_at: BOOKING_CREATED_AT, updated_at: null }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: mock.fn(() => { calls.push("release"); }),
  };
  return {
    calls,
    client,
    connectMock: mock.method(pool, "connect", async () => client),
    lockSlotMock: mock.method(slotRepository, "lockSlotById", async () => ({ id: 7, start_at: SLOT_START, bookable: true })),
    hasReservationMock: mock.method(reservationRepository, "hasConfirmedReservation", async () => false),
    freeTablesMock: mock.method(slotRepository, "findFreeTablesBySlotId", async () => freeTables()),
    insertReservationMock: mock.method(reservationRepository, "insertReservation", async () => 31),
    insertSeatsMock: mock.method(reservationRepository, "insertReservationSeats", async () => {}),
    sendConfirmationMock: mock.method(confirmationEmailService, "sendBookingConfirmation", async () => { calls.push("sendBookingConfirmation"); return emailSent; }),
  };
}

async function assertServiceError(promise, ErrorType, statusCode, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

describe("sendBookingConfirmation_unit", () => {
  // Verifies the hiker of the reservation gets one email, in HTML and plain text, with the documented subject and every booking detail.
  it("emails the booking details to the hiker who made the reservation", async () => {
    const { getConfirmationDataMock, sendMock } = mockDependencies();

    const result = await confirmationEmailService.sendBookingConfirmation(42);
    const message = sendMock.mock.calls[0].arguments[0];
    const html = visibleText(message.html);

    assert.equal(result, true);
    assert.equal(getConfirmationDataMock.mock.callCount(), 1);
    assert.deepEqual(getConfirmationDataMock.mock.calls[0].arguments, [42]);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.deepEqual(Object.keys(message).sort(), ["html", "subject", "text", "to"]);
    assert.equal(message.to, "ada.lovelace@example.com");
    assert.equal(message.subject, "Booking confirmed – MH-42");
    assert.match(html, /Hello, Ada Lovelace!/);
    assert.match(html, /Booking Reference MH-42 /);
    assert.match(html, /Date & Time 15 December 2026 - from 12:00 to 14:00 /);
    assert.match(html, /Party size 4 people /);
    assert.doesNotMatch(message.text, /<[a-z]/i);
    assert.match(message.text, /Hello, Ada Lovelace!/);
    assert.match(message.text, /Booking Reference\s+MH-42/);
    assert.match(message.text, /Date & Time\s+15 December 2026 - from 12:00 to 14:00/);
    assert.match(message.text, /Party size\s+4 people/);
  });

  // Verifies confirmation_sent_at is saved for the reservation only after the email has been sent.
  it("marks the confirmation as sent after sending the email", async () => {
    const { markConfirmationSentMock, sendMock } = mockDependencies();
    const calls = [];
    sendMock.mock.mockImplementation(async () => { calls.push("send"); });
    markConfirmationSentMock.mock.mockImplementation(async () => { calls.push("markConfirmationSent"); });

    await confirmationEmailService.sendBookingConfirmation(42);

    assert.deepEqual(calls, ["send", "markConfirmationSent"]);
    assert.deepEqual(markConfirmationSentMock.mock.calls[0].arguments, [42]);
  });

  // Verifies the slot is shown in the hut's time zone (Europe/Rome): UTC+1 in winter and UTC+2 in summer, never in UTC.
  it("shows the slot in the hut's local time in winter and in summer", async () => {
    const winter = await sentMessage(winterBooking());
    mock.reset();
    const summer = await sentMessage({ ...winterBooking(), startAt: new Date("2027-07-20T10:00:00.000Z"), endAt: new Date("2027-07-20T11:30:00.000Z") });

    assert.match(winter.html, /Date & Time 15 December 2026 - from 12:00 to 14:00 /);
    assert.match(winter.text, /Date & Time\s+15 December 2026 - from 12:00 to 14:00/);
    assert.match(summer.html, /Date & Time 20 July 2027 - from 12:00 to 13:30 /);
    assert.match(summer.text, /Date & Time\s+20 July 2027 - from 12:00 to 13:30/);
  });

  // Verifies the date is the hut's date for a slot that starts after midnight in Rome but before midnight in UTC.
  it("shows the hut's date for a slot that starts just after midnight", async () => {
    const { html, text } = await sentMessage({ ...winterBooking(), startAt: new Date("2026-12-31T23:30:00.000Z"), endAt: new Date("2027-01-01T01:00:00.000Z") });

    assert.match(html, /Date & Time 1 January 2027 - from 00:30 to 02:00 /);
    assert.match(text, /Date & Time\s+1 January 2027 - from 00:30 to 02:00/);
  });

  // Verifies the email contains no table numbers (issue #24).
  it("leaves the table numbers out of the email", async () => {
    const { html, text } = await sentMessage(winterBooking());

    assert.doesNotMatch(html, /table/i);
    assert.doesNotMatch(text, /table/i);
  });

  // Verifies a reservation that does not exist sends no email, saves nothing and returns false.
  it("returns false without sending anything when the reservation does not exist", async () => {
    const { getConfirmationDataMock, markConfirmationSentMock, sendMock } = mockDependencies(null);

    const result = await confirmationEmailService.sendBookingConfirmation(404);

    assert.equal(result, false);
    assert.deepEqual(getConfirmationDataMock.mock.calls[0].arguments, [404]);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markConfirmationSentMock.mock.callCount(), 0);
  });

  // Verifies a database error while reading the booking is logged instead of thrown, and no email is sent.
  it("returns false and logs the error when the booking data cannot be read", async () => {
    const { getConfirmationDataMock, markConfirmationSentMock, sendMock, consoleErrorMock } = mockDependencies();
    const databaseError = new Error("connection terminated");
    getConfirmationDataMock.mock.mockImplementation(async () => { throw databaseError; });

    const result = await confirmationEmailService.sendBookingConfirmation(42);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markConfirmationSentMock.mock.callCount(), 0);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
    assert.deepEqual(consoleErrorMock.mock.calls[0].arguments, ["Confirmation email for reservation 42 not sent:", databaseError]);
  });

  // Verifies an email the SMTP server does not accept is logged instead of thrown, returns false and leaves confirmation_sent_at unset.
  it("returns false and does not mark the confirmation when the email cannot be sent", async () => {
    const { markConfirmationSentMock, sendMock, consoleErrorMock } = mockDependencies();
    const smtpError = new Error("connect ECONNREFUSED 127.0.0.1:1025");
    sendMock.mock.mockImplementation(async () => { throw smtpError; });

    const result = await confirmationEmailService.sendBookingConfirmation(42);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(markConfirmationSentMock.mock.callCount(), 0);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
    assert.deepEqual(consoleErrorMock.mock.calls[0].arguments, ["Confirmation email for reservation 42 not sent:", smtpError]);
  });

  // Verifies the result stays true when the email was sent but saving confirmation_sent_at fails, and that failure is logged.
  it("returns true when the email was sent but confirmation_sent_at cannot be saved", async () => {
    const { markConfirmationSentMock, sendMock, consoleErrorMock } = mockDependencies();
    const databaseError = new Error("connection terminated");
    markConfirmationSentMock.mock.mockImplementation(async () => { throw databaseError; });

    const result = await confirmationEmailService.sendBookingConfirmation(42);

    assert.equal(result, true);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(markConfirmationSentMock.mock.callCount(), 1);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
    assert.deepEqual(consoleErrorMock.mock.calls[0].arguments, ["Confirmation email for reservation 42 sent, but confirmation_sent_at not saved:", databaseError]);
  });

  // Verifies booking data the template refuses to render is logged instead of thrown, and nothing is sent or saved.
  it("returns false without sending anything when the email cannot be rendered", async () => {
    const { markConfirmationSentMock, sendMock, consoleErrorMock } = mockDependencies({ ...winterBooking(), hikerName: " " });

    const result = await confirmationEmailService.sendBookingConfirmation(42);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markConfirmationSentMock.mock.callCount(), 0);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
    assert.equal(consoleErrorMock.mock.calls[0].arguments[1].message, "Missing required booking confirmation fields: hikerName");
  });
});

describe("createReservation_unit", () => {
  // Verifies a booking whose email was sent returns the booking with confirmationSent true, and the email is asked for that reservation.
  it("returns the booking with confirmationSent true when the confirmation email is sent", async () => {
    const { sendConfirmationMock } = mockBooking();

    const result = await reservationService.createReservation(5, 7, 6);

    assert.deepEqual(result, { ...confirmedBooking(), confirmationSent: true });
    assert.equal(sendConfirmationMock.mock.callCount(), 1);
    assert.deepEqual(sendConfirmationMock.mock.calls[0].arguments, [31]);
  });

  // Verifies a booking whose email was not sent stays committed and is returned with confirmationSent false instead of an error.
  it("keeps the booking and returns confirmationSent false when the confirmation email is not sent", async () => {
    const { calls } = mockBooking({ emailSent: false });

    const result = await reservationService.createReservation(5, 7, 6);

    assert.deepEqual(result, { ...confirmedBooking(), confirmationSent: false });
    assert.ok(calls.includes("COMMIT"));
    assert.equal(calls.includes("ROLLBACK"), false);
  });

  // Verifies the email is sent only after the transaction is committed and its database connection released.
  it("sends the confirmation email after the commit and after releasing the connection", async () => {
    const { calls } = mockBooking();

    await reservationService.createReservation(5, 7, 6);

    assert.deepEqual(calls.slice(-3), ["COMMIT", "release", "sendBookingConfirmation"]);
  });

  // Verifies a booking that is refused or fails to be saved is rolled back and no confirmation email is sent.
  it("sends no confirmation email when the booking is refused or cannot be saved", async () => {
    const cases = [
      { setUp: (mocks) => mocks.lockSlotMock.mock.mockImplementation(async () => undefined), ErrorType: NotFoundError, statusCode: 404, code: "SLOT_NOT_FOUND" },
      { setUp: (mocks) => mocks.lockSlotMock.mock.mockImplementation(async () => ({ id: 7, start_at: SLOT_START, bookable: false })), ErrorType: ErrorClass, statusCode: 422, code: "BOOKING_CLOSED" },
      { setUp: (mocks) => mocks.hasReservationMock.mock.mockImplementation(async () => true), ErrorType: ConflictError, statusCode: 409, code: "ALREADY_BOOKED" },
      { setUp: (mocks) => mocks.freeTablesMock.mock.mockImplementation(async () => [{ slotTableId: 71, tableNumber: 1, freeSeats: 5 }]), ErrorType: ConflictError, statusCode: 409, code: "NOT_ENOUGH_SEATS" },
      { setUp: (mocks) => mocks.insertSeatsMock.mock.mockImplementation(async () => { throw new ErrorClass("insert failed"); }), ErrorType: ErrorClass, statusCode: 500, code: "INTERNAL_ERROR" },
    ];

    for (const { setUp, ErrorType, statusCode, code } of cases) {
      const mocks = mockBooking();
      setUp(mocks);

      await assertServiceError(reservationService.createReservation(5, 7, 6), ErrorType, statusCode, code);

      assert.equal(mocks.sendConfirmationMock.mock.callCount(), 0, code);
      assert.ok(mocks.calls.includes("ROLLBACK"), code);
      assert.equal(mocks.calls.includes("COMMIT"), false, code);
      mock.reset();
    }
  });
});
