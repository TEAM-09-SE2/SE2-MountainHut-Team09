import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationController from "../../../src/controllers/reservation.controller.js";
import reservationService from "../../../src/services/reservation.service.js";

afterEach(() => {
  mock.reset();
});

const booking = (confirmationSent) => ({
  id: 31,
  slotId: 7,
  startAt: new Date("2026-12-15T11:00:00.000Z"),
  partySize: 6,
  status: "confirmed",
  tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }],
  confirmationSent,
});

function createResponse() {
  return {
    status: mock.fn(function (statusCode) { this.statusCode = statusCode; return this; }),
    json: mock.fn(function (body) { this.body = body; return this; }),
  };
}

describe("reservationController.createReservation", () => {
  // Verifies the booking is made for the logged-in hiker and sent with status 201 and confirmationSent true.
  it("returns 201 with confirmationSent true for the logged-in hiker's booking", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation", async () => booking(true));
    const res = createResponse();

    await reservationController.createReservation({ body: { slotId: 7, partySize: 6 }, user: { id: 5, role: "hiker" } }, res);

    assert.equal(createReservationMock.mock.callCount(), 1);
    assert.deepEqual(createReservationMock.mock.calls[0].arguments, [5, 7, 6, undefined]);
    assert.equal(res.statusCode, 201);
    assert.equal(res.json.mock.callCount(), 1);
    assert.deepEqual(res.body, booking(true));
  });

  // Verifies a booking whose email was not sent is still a success: status 201 with confirmationSent false.
  it("returns 201 with confirmationSent false when the confirmation email was not sent", async () => {
    mock.method(reservationService, "createReservation", async () => booking(false));
    const res = createResponse();

    await reservationController.createReservation({ body: { slotId: 7, partySize: 6 }, user: { id: 5, role: "hiker" } }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, booking(false));
  });
});
