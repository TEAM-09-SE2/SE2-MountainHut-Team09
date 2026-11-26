import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationRepository from "../../../src/database/reservation.repository.js";

function mockClient(rows) {
  return { query: mock.fn(async () => ({ rows })) };
}

describe("getBookingForCancel_unit (MH-08)", () => {
  // Verifies the booking is read on the transaction's client and its row is locked.
  it("locks the booking row on the given client", async () => {
    const client = mockClient([]);

    await reservationRepository.getBookingForCancel(client, 31, 12);

    assert.ok(client.query.mock.callCount() >= 1);
    assert.match(client.query.mock.calls[0].arguments[0], /FOR UPDATE/);
  });

  // Verifies the booking id and the hiker id are passed as parameters.
  it("passes the booking id and the hiker id as parameters", async () => {
    const client = mockClient([]);

    await reservationRepository.getBookingForCancel(client, 31, 12);

    assert.deepEqual(client.query.mock.calls[0].arguments[1], [31, 12]);
  });

  // Verifies the lookup always filters by the hiker, so a booking of another hiker is never found.
  it("always looks the booking up among the hiker's own bookings", async () => {
    const client = mockClient([]);

    await reservationRepository.getBookingForCancel(client, 31, 12);

    const sql = client.query.mock.calls[0].arguments[0];
    assert.match(sql, /hiker_id = \$2/);
    assert.doesNotMatch(sql, /IS NULL/);
  });

  // Verifies the locked booking is returned with its status and the start and end of its slot.
  it("returns the booking with the start and end of its slot", async () => {
    const row = {
      id: 31,
      hiker_id: 12,
      slot_id: 7,
      party_size: 4,
      status: "confirmed",
      confirmation_sent_at: null,
      start_at: new Date("2099-12-15T11:00:00.000Z"),
      end_at: new Date("2099-12-15T13:00:00.000Z"),
    };

    const result = await reservationRepository.getBookingForCancel(mockClient([row]), 31, 12);

    assert.deepEqual(result, row);
  });

  // Verifies nothing is returned when the booking does not exist or belongs to another hiker.
  it("returns undefined when no booking is found", async () => {
    assert.equal(await reservationRepository.getBookingForCancel(mockClient([]), 31, 13), undefined);
  });
});

describe("cancelReservation_unit (MH-08)", () => {
  // Verifies the booking is marked as cancelled with the time and the canceller, and no row is deleted.
  it("marks the booking as cancelled without deleting anything", async () => {
    const client = mockClient([{ cancelled_at: new Date(), id: 12, first_name: "Ada", last_name: "Lovelace", role: "hiker" }]);

    await reservationRepository.cancelReservation(client, 31, 12);

    const [sql, params] = client.query.mock.calls[0].arguments;
    assert.equal(client.query.mock.callCount(), 1);
    assert.match(sql, /status = 'cancelled'/);
    assert.match(sql, /cancelled_at = NOW\(\)/i);
    assert.match(sql, /cancelled_by = \$2/);
    assert.doesNotMatch(sql, /DELETE/i);
    assert.deepEqual(params, [31, 12]);
  });

  // Verifies the cancellation time and the canceller's id, name and role are returned.
  it("returns the cancellation time and who cancelled", async () => {
    const row = { cancelled_at: new Date("2099-12-10T09:30:00.000Z"), id: 3, first_name: "Giulia", last_name: "Bianchi", role: "employee" };

    const result = await reservationRepository.cancelReservation(mockClient([row]), 31, 3);

    assert.equal(result, row);
  });
});
