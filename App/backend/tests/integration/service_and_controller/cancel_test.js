import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import pool from "../../../src/database/connection.js";
import authRepository from "../../../src/database/auth.repository.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import emailSender from "../../../src/emails/emailSender.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "cancel-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

const ADA = { id: 12, first_name: "Ada", last_name: "Lovelace", role: "hiker" };
const GIULIA = { id: 3, first_name: "Giulia", last_name: "Bianchi", role: "employee" };
const MARCO = { id: 1, first_name: "Marco", last_name: "Rossi", role: "warden" };

const lockedBooking = (overrides = {}) => ({
  id: 31,
  hiker_id: 12,
  slot_id: 7,
  party_size: 4,
  status: "confirmed",
  confirmation_sent_at: new Date("2099-12-01T08:00:00.000Z"),
  start_at: new Date("2099-12-15T11:00:00.000Z"),
  end_at: new Date("2099-12-15T13:00:00.000Z"),
  ...overrides,
});

const confirmationData = (overrides = {}) => ({
  id: 31,
  partySize: 4,
  email: "ada.lovelace@example.com",
  hikerName: "Ada Lovelace",
  startAt: new Date("2099-12-15T11:00:00.000Z"),
  endAt: new Date("2099-12-15T13:00:00.000Z"),
  ...overrides,
});

function mockDatabase({ booking = lockedBooking(), canceller = ADA, data = confirmationData() } = {}) {
  const calls = [];
  const client = {
    query: mock.fn(async (sql) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    release: mock.fn(() => calls.push("release")),
  };
  return {
    calls,
    connectMock: mock.method(pool, "connect", async () => client),
    getBookingMock: mock.method(reservationRepository, "getBookingForCancel", async () => booking),
    cancelMock: mock.method(reservationRepository, "cancelReservation", async () => ({
      cancelled_at: new Date("2099-12-10T09:30:00.000Z"),
      ...canceller,
    })),
    dataMock: mock.method(reservationRepository, "getConfirmationData", async () => data),
    requirementsMock: mock.method(reservationRepository, "getRequirementsByReservationId", async () => []),
    sendMock: mock.method(emailSender, "send", async () => {}),
  };
}

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

beforeEach(() => {
  mock.method(console, "error", () => {});
  mock.method(authRepository, "findUserById", async (id) =>
    [ADA, GIULIA, MARCO].find((user) => user.id === id) ?? null,
  );
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

function loginCookie({ id, role }) {
  const token = jwt.sign({ id, email: `${role}@example.com`, role }, testJwtSecret, { expiresIn: "1d" });
  return `token=${token}`;
}

const hikerCookie = loginCookie({ id: 12, role: "hiker" });
const employeeCookie = loginCookie({ id: 3, role: "employee" });
const wardenCookie = loginCookie({ id: 1, role: "warden" });

async function cancel(path, cookie, body) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.match(response.headers.get("content-type"), /^application\/json/);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/v1/reservations/:id/cancel (MH-08)", () => {
  // Verifies the hiker gets 200 with the cancelled booking in the documented format and confirmationSent true.
  it("answers 200 with the cancelled booking in the documented format", async () => {
    mockDatabase();

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      id: 31,
      slotId: 7,
      startAt: "2099-12-15T11:00:00.000Z",
      partySize: 4,
      status: "cancelled",
      cancelledAt: "2099-12-10T09:30:00.000Z",
      cancelledBy: { id: 12, firstName: "Ada", lastName: "Lovelace", role: "hiker" },
      confirmationSent: true,
    });
  });

  // Verifies the booking is looked up only among the logged-in hiker's bookings and cancelled in their name, in one committed transaction.
  it("cancels only within the logged-in hiker's bookings, in one transaction", async () => {
    const mocks = mockDatabase();

    await cancel("/reservations/31/cancel", hikerCookie);

    assert.deepEqual(mocks.getBookingMock.mock.calls[0].arguments.slice(1), [31, 12]);
    assert.deepEqual(mocks.cancelMock.mock.calls[0].arguments.slice(1), [31, 12]);
    assert.deepEqual(mocks.calls, ["BEGIN", "COMMIT", "release"]);
  });

  // Verifies a body cannot change whose booking is cancelled or who is recorded as canceller.
  it("ignores a body that names another hiker", async () => {
    const mocks = mockDatabase();

    const response = await cancel("/reservations/31/cancel", hikerCookie, { hikerId: 13, cancelledBy: 3 });

    assert.equal(response.status, 200);
    assert.deepEqual(mocks.getBookingMock.mock.calls[0].arguments.slice(1), [31, 12]);
    assert.deepEqual(mocks.cancelMock.mock.calls[0].arguments.slice(1), [31, 12]);
  });

  // Verifies the "booking cancelled" email goes to the hiker with the documented subject after the commit.
  it("emails the hiker after the cancellation is committed", async () => {
    const mocks = mockDatabase();

    await cancel("/reservations/31/cancel", hikerCookie);
    const message = mocks.sendMock.mock.calls[0].arguments[0];

    assert.equal(mocks.sendMock.mock.callCount(), 1);
    assert.equal(message.to, "ada.lovelace@example.com");
    assert.equal(message.subject, "Booking cancelled – MH-31");
    assert.match(message.text, /Your reservation has been cancelled/);
    assert.deepEqual(mocks.dataMock.mock.calls[0].arguments, [31]);
  });

  // Verifies the cancellation is still answered 200 with confirmationSent false when the email cannot be sent.
  it("answers 200 with confirmationSent false when the email fails", async () => {
    const mocks = mockDatabase();
    mocks.sendMock.mock.mockImplementation(async () => { throw new Error("SMTP unavailable"); });

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
    assert.equal(response.body.confirmationSent, false);
    assert.deepEqual(mocks.calls, ["BEGIN", "COMMIT", "release"]);
  });

  // Verifies a booking that does not exist or belongs to another hiker is answered 404 RESERVATION_NOT_FOUND and rolled back.
  it("answers 404 RESERVATION_NOT_FOUND when the booking is not the hiker's", async () => {
    const mocks = mockDatabase({ booking: null });

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "RESERVATION_NOT_FOUND");
    assert.equal(typeof response.body.message, "string");
    assert.equal(mocks.cancelMock.mock.callCount(), 0);
    assert.equal(mocks.sendMock.mock.callCount(), 0);
    assert.deepEqual(mocks.calls, ["BEGIN", "ROLLBACK", "release"]);
  });

  // Verifies an already cancelled booking is answered 409 RESERVATION_CANCELLED.
  it("answers 409 RESERVATION_CANCELLED when the booking is already cancelled", async () => {
    const mocks = mockDatabase({ booking: lockedBooking({ status: "cancelled" }) });

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 409);
    assert.equal(response.body.error, "RESERVATION_CANCELLED");
    assert.equal(mocks.cancelMock.mock.callCount(), 0);
    assert.equal(mocks.sendMock.mock.callCount(), 0);
  });

  // Verifies a booking whose slot has ended is answered 422 SLOT_ENDED.
  it("answers 422 SLOT_ENDED when the slot has ended", async () => {
    const mocks = mockDatabase({
      booking: lockedBooking({ start_at: new Date("2001-12-15T11:00:00.000Z"), end_at: new Date("2001-12-15T13:00:00.000Z") }),
    });

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 422);
    assert.equal(response.body.error, "SLOT_ENDED");
    assert.equal(mocks.cancelMock.mock.callCount(), 0);
    assert.equal(mocks.sendMock.mock.callCount(), 0);
  });

  // Verifies a booking can be cancelled while its slot is in progress.
  it("answers 200 while the slot is in progress", async () => {
    mockDatabase({
      booking: lockedBooking({ start_at: new Date(Date.now() - 10 * 60 * 1000), end_at: new Date(Date.now() + 50 * 60 * 1000) }),
    });

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
  });

  // Verifies an id that is not a positive integer is answered 400 INVALID_INPUT without touching the database.
  it("answers 400 INVALID_INPUT for an id that is not a positive integer", async () => {
    const mocks = mockDatabase();

    for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
      const response = await cancel(`/reservations/${id}/cancel`, hikerCookie);
      assert.equal(response.status, 400, `id ${id}`);
      assert.equal(response.body.error, "INVALID_INPUT");
    }

    assert.equal(mocks.connectMock.mock.callCount(), 0);
  });

  // Verifies a request without a login cookie, or with an invalid one, is answered 401 NOT_AUTHENTICATED.
  it("answers 401 NOT_AUTHENTICATED without a valid login", async () => {
    const mocks = mockDatabase();

    const missing = await cancel("/reservations/31/cancel");
    const invalid = await cancel("/reservations/31/cancel", "token=not-a-jwt");
    const wrongSecret = await cancel("/reservations/31/cancel", `token=${jwt.sign({ id: 12, role: "hiker" }, "another-secret")}`);

    for (const response of [missing, invalid, wrongSecret]) {
      assert.equal(response.status, 401);
      assert.equal(response.body.error, "NOT_AUTHENTICATED");
    }
    assert.equal(mocks.connectMock.mock.callCount(), 0);
  });

  // Verifies staff cannot use the hiker's endpoint (403 FORBIDDEN_ROLE).
  it("answers 403 FORBIDDEN_ROLE to staff", async () => {
    const mocks = mockDatabase();

    const employee = await cancel("/reservations/31/cancel", employeeCookie);
    const warden = await cancel("/reservations/31/cancel", wardenCookie);

    assert.deepEqual([employee.status, employee.body.error], [403, "FORBIDDEN_ROLE"]);
    assert.deepEqual([warden.status, warden.body.error], [403, "FORBIDDEN_ROLE"]);
    assert.equal(mocks.connectMock.mock.callCount(), 0);
  });

  // Verifies a database failure is answered 500 INTERNAL_ERROR, rolled back, and sends no email.
  it("answers 500 INTERNAL_ERROR and rolls back when the database fails", async () => {
    const mocks = mockDatabase();
    mocks.cancelMock.mock.mockImplementation(async () => { throw new Error("connection lost"); });

    const response = await cancel("/reservations/31/cancel", hikerCookie);

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "INTERNAL_ERROR");
    assert.deepEqual(mocks.calls, ["BEGIN", "ROLLBACK", "release"]);
    assert.equal(mocks.sendMock.mock.callCount(), 0);
  });
});

describe("POST /api/v1/staff/reservations/:id/cancel (MH-08)", () => {
  // Verifies an employee gets 200 with the cancelled booking and is recorded as the canceller.
  it("answers 200 to an employee with the employee as canceller", async () => {
    const mocks = mockDatabase({ canceller: GIULIA });

    const response = await cancel("/staff/reservations/31/cancel", employeeCookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      id: 31,
      slotId: 7,
      startAt: "2099-12-15T11:00:00.000Z",
      partySize: 4,
      status: "cancelled",
      cancelledAt: "2099-12-10T09:30:00.000Z",
      cancelledBy: { id: 3, firstName: "Giulia", lastName: "Bianchi", role: "employee" },
      confirmationSent: true,
    });
    assert.deepEqual(mocks.getBookingMock.mock.calls[0].arguments.slice(1), [31, null]);
    assert.deepEqual(mocks.cancelMock.mock.calls[0].arguments.slice(1), [31, 3]);
  });

  // Verifies the warden can cancel any booking and is recorded as the canceller.
  it("answers 200 to the warden with the warden as canceller", async () => {
    const mocks = mockDatabase({ canceller: MARCO });

    const response = await cancel("/staff/reservations/31/cancel", wardenCookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.cancelledBy, { id: 1, firstName: "Marco", lastName: "Rossi", role: "warden" });
    assert.deepEqual(mocks.getBookingMock.mock.calls[0].arguments.slice(1), [31, null]);
    assert.deepEqual(mocks.cancelMock.mock.calls[0].arguments.slice(1), [31, 1]);
  });

  // Verifies the email of a staff cancellation goes to the hiker of the booking, not to the staff member.
  it("emails the hiker of the booking", async () => {
    const mocks = mockDatabase({ canceller: GIULIA });

    const response = await cancel("/staff/reservations/31/cancel", employeeCookie);

    assert.equal(response.body.confirmationSent, true);
    assert.equal(mocks.sendMock.mock.calls[0].arguments[0].to, "ada.lovelace@example.com");
  });

  // Verifies a temporary hiker's booking is cancelled with confirmationSent false, because the hiker has no email.
  it("answers 200 with confirmationSent false for a temporary hiker without email", async () => {
    const mocks = mockDatabase({ canceller: GIULIA, data: confirmationData({ email: null, hikerName: "Luca Verdi" }) });

    const response = await cancel("/staff/reservations/31/cancel", employeeCookie);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
    assert.equal(response.body.confirmationSent, false);
    assert.equal(mocks.sendMock.mock.callCount(), 0);
  });

  // Verifies staff get 404 RESERVATION_NOT_FOUND for a booking that does not exist.
  it("answers 404 RESERVATION_NOT_FOUND when the booking does not exist", async () => {
    mockDatabase({ booking: null });

    const response = await cancel("/staff/reservations/31/cancel", employeeCookie);

    assert.deepEqual([response.status, response.body.error], [404, "RESERVATION_NOT_FOUND"]);
  });

  // Verifies staff get 409 RESERVATION_CANCELLED for a booking that is already cancelled.
  it("answers 409 RESERVATION_CANCELLED when the booking is already cancelled", async () => {
    mockDatabase({ booking: lockedBooking({ status: "cancelled" }) });

    const response = await cancel("/staff/reservations/31/cancel", employeeCookie);

    assert.deepEqual([response.status, response.body.error], [409, "RESERVATION_CANCELLED"]);
  });

  // Verifies staff get 422 SLOT_ENDED for a booking whose slot has ended.
  it("answers 422 SLOT_ENDED when the slot has ended", async () => {
    const mocks = mockDatabase({ booking: lockedBooking({ end_at: new Date("2001-12-15T13:00:00.000Z") }) });

    const response = await cancel("/staff/reservations/31/cancel", wardenCookie);

    assert.deepEqual([response.status, response.body.error], [422, "SLOT_ENDED"]);
    assert.equal(mocks.cancelMock.mock.callCount(), 0);
  });

  // Verifies an id that is not a positive integer is answered 400 INVALID_INPUT without touching the database.
  it("answers 400 INVALID_INPUT for an id that is not a positive integer", async () => {
    const mocks = mockDatabase();

    for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
      const response = await cancel(`/staff/reservations/${id}/cancel`, employeeCookie);
      assert.equal(response.status, 400, `id ${id}`);
      assert.equal(response.body.error, "INVALID_INPUT");
    }

    assert.equal(mocks.connectMock.mock.callCount(), 0);
  });

  // Verifies a request without a valid login is answered 401 NOT_AUTHENTICATED.
  it("answers 401 NOT_AUTHENTICATED without a valid login", async () => {
    const mocks = mockDatabase();

    const missing = await cancel("/staff/reservations/31/cancel");
    const invalid = await cancel("/staff/reservations/31/cancel", "token=not-a-jwt");

    assert.deepEqual([missing.status, missing.body.error], [401, "NOT_AUTHENTICATED"]);
    assert.deepEqual([invalid.status, invalid.body.error], [401, "NOT_AUTHENTICATED"]);
    assert.equal(mocks.connectMock.mock.callCount(), 0);
  });

  // Verifies a hiker cannot use the staff endpoint (403 FORBIDDEN_ROLE).
  it("answers 403 FORBIDDEN_ROLE to a hiker", async () => {
    const mocks = mockDatabase();

    const response = await cancel("/staff/reservations/31/cancel", hikerCookie);

    assert.deepEqual([response.status, response.body.error], [403, "FORBIDDEN_ROLE"]);
    assert.equal(mocks.connectMock.mock.callCount(), 0);
  });
});
