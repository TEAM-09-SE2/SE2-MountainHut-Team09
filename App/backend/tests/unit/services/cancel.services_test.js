import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import { ConflictError, ErrorClass, NotFoundError } from "../../../src/errors/ErrorClass.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import reservationService from "../../../src/services/reservation.service.js";

afterEach(() => {
  mock.reset();
});

const NOW = new Date("2099-12-10T09:30:00.000Z");
const SLOT_START = new Date("2099-12-15T11:00:00.000Z");
const SLOT_END = new Date("2099-12-15T13:00:00.000Z");
const CANCELLED_AT = new Date("2099-12-10T09:30:00.123Z");

const ADA = { id: 12, first_name: "Ada", last_name: "Lovelace", role: "hiker" };
const GIULIA = { id: 3, first_name: "Giulia", last_name: "Bianchi", role: "employee" };

const lockedBooking = (overrides = {}) => ({
  id: 31,
  hiker_id: 12,
  slot_id: 7,
  party_size: 4,
  status: "confirmed",
  confirmation_sent_at: new Date("2099-12-01T08:00:00.000Z"),
  start_at: SLOT_START,
  end_at: SLOT_END,
  ...overrides,
});

function mockCancelBooking({ booking = lockedBooking(), canceller = ADA, emailSent = true } = {}) {
  const calls = [];
  const client = {
    query: mock.fn(async (sql) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    release: mock.fn(() => calls.push("release")),
  };
  mock.method(Date, "now", () => NOW.getTime());
  return {
    calls,
    client,
    connectMock: mock.method(pool, "connect", async () => client),
    getBookingMock: mock.method(reservationRepository, "getBookingForCancel", async (...args) => {
      calls.push("getBookingForCancel");
      return typeof booking === "function" ? booking(...args) : booking;
    }),
    cancelMock: mock.method(reservationRepository, "cancelReservation", async () => {
      calls.push("cancelReservation");
      return { cancelled_at: CANCELLED_AT, ...canceller };
    }),
    emailMock: mock.method(confirmationEmailService, "sendBookingCancellation", async () => {
      calls.push("sendBookingCancellation");
      return emailSent;
    }),
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

function assertNothingCancelled(mocks) {
  assert.equal(mocks.cancelMock.mock.callCount(), 0);
  assert.equal(mocks.emailMock.mock.callCount(), 0);
  assert.deepEqual(mocks.calls.slice(-2), ["ROLLBACK", "release"]);
  assert.ok(!mocks.calls.includes("COMMIT"));
}

describe("cancelBooking_unit (MH-08)", () => {
  // Verifies a hiker's cancellation returns the documented booking fields with the hiker as canceller and confirmationSent true.
  it("returns the cancelled booking in the documented format", async () => {
    mockCancelBooking();

    const result = await reservationService.cancelBooking(31, 12, 12);

    assert.deepEqual(result, {
      id: 31,
      slotId: 7,
      startAt: SLOT_START,
      partySize: 4,
      status: "cancelled",
      cancelledAt: CANCELLED_AT,
      cancelledBy: { id: 12, firstName: "Ada", lastName: "Lovelace", role: "hiker" },
      confirmationSent: true,
    });
  });

  // Verifies the hiker's own id is used both to find only their booking and to record who cancelled it.
  it("looks the booking up for the hiker and records the hiker as canceller", async () => {
    const mocks = mockCancelBooking();

    await reservationService.cancelBooking(31, 12, 12);

    assert.deepEqual(mocks.getBookingMock.mock.calls[0].arguments, [mocks.client, 31, 12]);
    assert.deepEqual(mocks.cancelMock.mock.calls[0].arguments, [mocks.client, 31, 12]);
  });

  // Verifies staff look the booking up without an owner and are recorded as the canceller.
  it("lets staff cancel any booking and records the staff member as canceller", async () => {
    const mocks = mockCancelBooking({ canceller: GIULIA });

    const result = await reservationService.cancelBooking(31, 3, null);

    assert.deepEqual(mocks.getBookingMock.mock.calls[0].arguments, [mocks.client, 31, null]);
    assert.deepEqual(mocks.cancelMock.mock.calls[0].arguments, [mocks.client, 31, 3]);
    assert.deepEqual(result.cancelledBy, { id: 3, firstName: "Giulia", lastName: "Bianchi", role: "employee" });
  });

  // Verifies that without an owner id the lookup is done as for staff.
  it("looks the booking up without an owner when no hiker id is given", async () => {
    const mocks = mockCancelBooking({ canceller: GIULIA });

    await reservationService.cancelBooking(31, 3);

    assert.equal(mocks.getBookingMock.mock.calls[0].arguments[2], null);
  });

  // Verifies the lock, the checks and the update run in one transaction that is committed before the connection is released.
  it("locks, cancels and commits in one transaction on a single connection", async () => {
    const mocks = mockCancelBooking();

    await reservationService.cancelBooking(31, 12, 12);

    assert.equal(mocks.connectMock.mock.callCount(), 1);
    assert.deepEqual(mocks.calls.slice(0, 5), ["BEGIN", "getBookingForCancel", "cancelReservation", "COMMIT", "release"]);
    assert.equal(mocks.client.release.mock.callCount(), 1);
  });

  // Verifies the cancellation email is sent for the booking only after the commit and the release of the connection.
  it("sends the cancellation email after the commit and after releasing the connection", async () => {
    const mocks = mockCancelBooking();

    await reservationService.cancelBooking(31, 12, 12);

    assert.deepEqual(mocks.calls, ["BEGIN", "getBookingForCancel", "cancelReservation", "COMMIT", "release", "sendBookingCancellation"]);
    assert.deepEqual(mocks.emailMock.mock.calls[0].arguments, [31]);
  });

  // Verifies a failed email does not undo the cancellation: the booking stays cancelled with confirmationSent false.
  it("keeps the cancellation and answers confirmationSent false when the email is not sent", async () => {
    const mocks = mockCancelBooking({ emailSent: false });

    const result = await reservationService.cancelBooking(31, 12, 12);

    assert.equal(result.status, "cancelled");
    assert.equal(result.confirmationSent, false);
    assert.ok(mocks.calls.includes("COMMIT"));
    assert.ok(!mocks.calls.includes("ROLLBACK"));
  });

  // Verifies a booking that does not exist, or belongs to another hiker, is answered 404 RESERVATION_NOT_FOUND and nothing changes.
  it("answers 404 RESERVATION_NOT_FOUND when the booking is not found for the hiker", async () => {
    const mocks = mockCancelBooking({ booking: null });

    await assertServiceError(reservationService.cancelBooking(31, 12, 12), NotFoundError, 404, "RESERVATION_NOT_FOUND");

    assertNothingCancelled(mocks);
  });

  // Verifies staff also get 404 RESERVATION_NOT_FOUND for a booking id that does not exist.
  it("answers 404 RESERVATION_NOT_FOUND to staff when the booking does not exist", async () => {
    const mocks = mockCancelBooking({ booking: null, canceller: GIULIA });

    await assertServiceError(reservationService.cancelBooking(999, 3, null), NotFoundError, 404, "RESERVATION_NOT_FOUND");

    assertNothingCancelled(mocks);
  });

  // Verifies an already cancelled booking cannot be cancelled again (409 RESERVATION_CANCELLED) and nothing changes.
  it("answers 409 RESERVATION_CANCELLED when the booking is already cancelled", async () => {
    const mocks = mockCancelBooking({ booking: lockedBooking({ status: "cancelled" }) });

    await assertServiceError(reservationService.cancelBooking(31, 12, 12), ConflictError, 409, "RESERVATION_CANCELLED");

    assertNothingCancelled(mocks);
  });

  // Verifies an already cancelled booking of a past slot is still answered as already cancelled.
  it("answers 409 RESERVATION_CANCELLED for a cancelled booking whose slot has ended", async () => {
    const mocks = mockCancelBooking({
      booking: lockedBooking({
        status: "cancelled",
        start_at: new Date("2099-12-09T11:00:00.000Z"),
        end_at: new Date("2099-12-09T13:00:00.000Z"),
      }),
    });

    await assertServiceError(reservationService.cancelBooking(31, 12, 12), ConflictError, 409, "RESERVATION_CANCELLED");

    assertNothingCancelled(mocks);
  });

  // Verifies a booking whose slot has already ended cannot be cancelled (422 SLOT_ENDED) and nothing changes.
  it("answers 422 SLOT_ENDED when the slot has already ended", async () => {
    const mocks = mockCancelBooking({
      booking: lockedBooking({
        start_at: new Date("2099-12-09T11:00:00.000Z"),
        end_at: new Date("2099-12-09T13:00:00.000Z"),
      }),
    });

    await assertServiceError(reservationService.cancelBooking(31, 12, 12), ErrorClass, 422, "SLOT_ENDED");

    assertNothingCancelled(mocks);
  });

  // Verifies staff cannot cancel a booking whose slot has already ended either.
  it("answers 422 SLOT_ENDED to staff when the slot has already ended", async () => {
    const mocks = mockCancelBooking({
      canceller: GIULIA,
      booking: lockedBooking({
        start_at: new Date("2099-12-09T11:00:00.000Z"),
        end_at: new Date("2099-12-09T13:00:00.000Z"),
      }),
    });

    await assertServiceError(reservationService.cancelBooking(31, 3, null), ErrorClass, 422, "SLOT_ENDED");

    assertNothingCancelled(mocks);
  });

  // Verifies the slot counts as ended at its exact end time.
  it("answers 422 SLOT_ENDED at the exact end of the slot", async () => {
    const mocks = mockCancelBooking({
      booking: lockedBooking({ start_at: new Date(NOW.getTime() - 60 * 60 * 1000), end_at: NOW }),
    });

    await assertServiceError(reservationService.cancelBooking(31, 12, 12), ErrorClass, 422, "SLOT_ENDED");

    assertNothingCancelled(mocks);
  });

  // Verifies a booking can still be cancelled one millisecond before the slot ends.
  it("cancels a booking one millisecond before the slot ends", async () => {
    const mocks = mockCancelBooking({
      booking: lockedBooking({
        start_at: new Date(NOW.getTime() - 60 * 60 * 1000),
        end_at: new Date(NOW.getTime() + 1),
      }),
    });

    const result = await reservationService.cancelBooking(31, 12, 12);

    assert.equal(result.status, "cancelled");
    assert.equal(mocks.cancelMock.mock.callCount(), 1);
  });

  // Verifies a booking can be cancelled while its slot is in progress, e.g. 10 minutes after the start.
  it("cancels a booking while its slot is in progress", async () => {
    const mocks = mockCancelBooking({
      booking: lockedBooking({
        start_at: new Date(NOW.getTime() - 10 * 60 * 1000),
        end_at: new Date(NOW.getTime() + 50 * 60 * 1000),
      }),
    });

    const result = await reservationService.cancelBooking(31, 12, 12);

    assert.equal(result.status, "cancelled");
    assert.ok(mocks.calls.includes("COMMIT"));
  });

  // Verifies there is no other time limit: a booking starting in a few minutes or in years can be cancelled.
  it("has no other time limit before the slot ends", async () => {
    for (const startsIn of [60 * 1000, 2 * 60 * 60 * 1000, 47 * 60 * 60 * 1000, 3 * 365 * 24 * 60 * 60 * 1000]) {
      mockCancelBooking({
        booking: lockedBooking({
          start_at: new Date(NOW.getTime() + startsIn),
          end_at: new Date(NOW.getTime() + startsIn + 60 * 60 * 1000),
        }),
      });

      const result = await reservationService.cancelBooking(31, 12, 12);

      assert.equal(result.status, "cancelled");
      mock.reset();
    }
  });

  // Verifies a database error while cancelling rolls the transaction back, releases the connection and sends no email.
  it("rolls back and sends no email when the update fails", async () => {
    const mocks = mockCancelBooking();
    const error = new Error("connection lost");
    mocks.cancelMock.mock.mockImplementation(async () => { throw error; });

    await assert.rejects(reservationService.cancelBooking(31, 12, 12), (thrown) => thrown === error);

    assert.equal(mocks.emailMock.mock.callCount(), 0);
    assert.deepEqual(mocks.calls.slice(-2), ["ROLLBACK", "release"]);
    assert.ok(!mocks.calls.includes("COMMIT"));
  });

  // Verifies a failed commit is rolled back, the connection released, and no email sent.
  it("rolls back and sends no email when the commit fails", async () => {
    const mocks = mockCancelBooking();
    const error = new Error("could not serialize access");
    mocks.client.query.mock.mockImplementation(async (sql) => {
      mocks.calls.push(sql);
      if (sql === "COMMIT") throw error;
      return { rows: [], rowCount: 0 };
    });

    await assert.rejects(reservationService.cancelBooking(31, 12, 12), (thrown) => thrown === error);

    assert.equal(mocks.emailMock.mock.callCount(), 0);
    assert.deepEqual(mocks.calls.slice(-3), ["COMMIT", "ROLLBACK", "release"]);
  });

  // Verifies the connection is released even when the lookup fails.
  it("releases the connection when the lookup fails", async () => {
    const mocks = mockCancelBooking();
    mocks.getBookingMock.mock.mockImplementation(async () => { throw new Error("lock timeout"); });

    await assert.rejects(reservationService.cancelBooking(31, 12, 12), /lock timeout/);

    assert.equal(mocks.client.release.mock.callCount(), 1);
    assert.equal(mocks.cancelMock.mock.callCount(), 0);
  });
});
