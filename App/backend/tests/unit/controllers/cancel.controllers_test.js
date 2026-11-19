import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationController from "../../../src/controllers/reservation.controller.js";
import reservationService from "../../../src/services/reservation.service.js";
import { BadRequestError, NotFoundError } from "../../../src/errors/ErrorClass.js";

afterEach(() => {
  mock.reset();
});

function createResponse() {
  return {
    status: mock.fn(function (statusCode) { this.statusCode = statusCode; return this; }),
    json: mock.fn(function (body) { this.body = body; return this; }),
  };
}

const hiker = { id: 12, email: "ada.lovelace@example.com", role: "hiker" };
const employee = { id: 3, email: "giulia.bianchi@example.com", role: "employee" };
const warden = { id: 1, email: "marco.rossi@example.com", role: "warden" };

const cancelledBooking = (cancelledBy) => ({
  id: 31,
  slotId: 7,
  startAt: new Date("2099-12-15T11:00:00.000Z"),
  partySize: 4,
  status: "cancelled",
  cancelledAt: new Date("2099-12-01T09:30:00.000Z"),
  cancelledBy,
  confirmationSent: true,
});

const INVALID_IDS = ["abc", "0", "-1", "1.5", "", "2147483648"];

async function assertInvalidId(promise) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof BadRequestError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, "INVALID_INPUT");
    return true;
  });
}

describe("reservationController.cancelMyBooking (MH-08)", () => {
  // Verifies the hiker's cancellation reaches the service with the booking id, the hiker as canceller and the hiker as owner.
  it("passes the booking id and the logged-in hiker to the service as canceller and owner", async () => {
    const cancelMock = mock.method(reservationService, "cancelBooking", async () => cancelledBooking({ id: 12 }));

    await reservationController.cancelMyBooking({ params: { id: "31" }, user: hiker }, createResponse());

    assert.deepEqual(cancelMock.mock.calls[0].arguments, [31, 12, 12]);
  });

  // Verifies the cancelled booking returned by the service is sent back as it is with status 200.
  it("answers 200 with the cancelled booking", async () => {
    const booking = cancelledBooking({ id: 12, firstName: "Ada", lastName: "Lovelace", role: "hiker" });
    mock.method(reservationService, "cancelBooking", async () => booking);
    const response = createResponse();

    await reservationController.cancelMyBooking({ params: { id: "31" }, user: hiker }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, booking);
    assert.equal(response.json.mock.callCount(), 1);
  });

  // Verifies the largest id PostgreSQL can store is still accepted.
  it("accepts the largest PostgreSQL integer as booking id", async () => {
    const cancelMock = mock.method(reservationService, "cancelBooking", async () => cancelledBooking({ id: 12 }));

    await reservationController.cancelMyBooking({ params: { id: "2147483647" }, user: hiker }, createResponse());

    assert.equal(cancelMock.mock.calls[0].arguments[0], 2147483647);
  });

  // Verifies an id that is not a positive integer is refused with 400 INVALID_INPUT before the service is called.
  it("refuses an id that is not a positive integer with 400 INVALID_INPUT", async () => {
    const cancelMock = mock.method(reservationService, "cancelBooking", async () => cancelledBooking({ id: 12 }));

    for (const id of INVALID_IDS) {
      await assertInvalidId(reservationController.cancelMyBooking({ params: { id }, user: hiker }, createResponse()));
    }

    assert.equal(cancelMock.mock.callCount(), 0);
  });

  // Verifies a service error reaches the error handler and no response is written.
  it("lets a service error through without answering", async () => {
    const error = new NotFoundError("The reservation does not exist.", "RESERVATION_NOT_FOUND");
    mock.method(reservationService, "cancelBooking", async () => { throw error; });
    const response = createResponse();

    await assert.rejects(
      reservationController.cancelMyBooking({ params: { id: "31" }, user: hiker }, response),
      (thrown) => thrown === error,
    );
    assert.equal(response.status.mock.callCount(), 0);
    assert.equal(response.json.mock.callCount(), 0);
  });
});

describe("reservationController.cancelBookingAsStaff (MH-08)", () => {
  // Verifies a staff cancellation reaches the service with the staff member as canceller and no owner check.
  it("passes the booking id and the staff member as canceller, without an owner", async () => {
    const cancelMock = mock.method(reservationService, "cancelBooking", async () => cancelledBooking({ id: 3 }));

    await reservationController.cancelBookingAsStaff({ params: { id: "31" }, user: employee }, createResponse());
    await reservationController.cancelBookingAsStaff({ params: { id: "32" }, user: warden }, createResponse());

    assert.deepEqual(cancelMock.mock.calls[0].arguments, [31, 3, null]);
    assert.deepEqual(cancelMock.mock.calls[1].arguments, [32, 1, null]);
  });

  // Verifies the cancelled booking returned by the service is sent back as it is with status 200.
  it("answers 200 with the cancelled booking", async () => {
    const booking = cancelledBooking({ id: 3, firstName: "Giulia", lastName: "Bianchi", role: "employee" });
    mock.method(reservationService, "cancelBooking", async () => booking);
    const response = createResponse();

    await reservationController.cancelBookingAsStaff({ params: { id: "31" }, user: employee }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, booking);
  });

  // Verifies an id that is not a positive integer is refused with 400 INVALID_INPUT before the service is called.
  it("refuses an id that is not a positive integer with 400 INVALID_INPUT", async () => {
    const cancelMock = mock.method(reservationService, "cancelBooking", async () => cancelledBooking({ id: 3 }));

    for (const id of INVALID_IDS) {
      await assertInvalidId(reservationController.cancelBookingAsStaff({ params: { id }, user: employee }, createResponse()));
    }

    assert.equal(cancelMock.mock.callCount(), 0);
  });

  // Verifies a service error reaches the error handler and no response is written.
  it("lets a service error through without answering", async () => {
    const error = new Error("database unavailable");
    mock.method(reservationService, "cancelBooking", async () => { throw error; });
    const response = createResponse();

    await assert.rejects(
      reservationController.cancelBookingAsStaff({ params: { id: "31" }, user: employee }, response),
      (thrown) => thrown === error,
    );
    assert.equal(response.json.mock.callCount(), 0);
  });
});
