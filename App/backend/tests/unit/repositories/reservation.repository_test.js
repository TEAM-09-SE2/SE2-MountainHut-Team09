import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";

afterEach(() => {
  mock.reset();
});

describe("MH-06 reservation repository", () => {
  it("uses the slot end time for cancellability and the 48-hour window for changes", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [] }));

    await reservationRepository.getUpcomingBookingsByHikerId(12);

    const query = queryMock.mock.calls[0].arguments[0];
    assert.match(
      query,
      /WHEN r\.status = 'cancelled'\s+THEN false\s+WHEN s\.end_at > NOW\(\)\s+THEN true\s+ELSE false\s+END as cancellable/,
    );
    assert.match(
      query,
      /WHEN r\.status = 'cancelled'\s+THEN false\s+WHEN s\.start_at > NOW\(\) \+ INTERVAL '48 hours'\s+THEN true\s+ELSE false\s+END as changeable/,
    );
  });

  it("maps upcoming bookings and their requirements into the API response shape", async () => {
    const startAt = new Date("2099-12-15T11:00:00.000Z");
    const endAt = new Date("2099-12-15T13:00:00.000Z");
    const createdAt = new Date("2099-09-01T10:00:00.000Z");
    const updatedAt = new Date("2099-10-01T10:00:00.000Z");
    const cancelledAt = new Date("2099-12-01T10:00:00.000Z");
    const queryMock = mock.method(pool, "query", async (sql) => {
      if (sql.includes("FROM reservation r")) {
        return {
          rows: [
            {
              id: 31,
              hiker_id: 12,
              slot_id: 7,
              party_size: 4,
              status: "confirmed",
              created_at: createdAt,
              start_at: startAt,
              end_at: endAt,
              updated_at: updatedAt,
              changeable: true,
              cancellable: true,
              cancelled_at: null,
            },
            {
              id: 32,
              hiker_id: 12,
              slot_id: 8,
              party_size: 2,
              status: "cancelled",
              created_at: createdAt,
              start_at: new Date("2099-12-16T11:00:00.000Z"),
              end_at: new Date("2099-12-16T13:00:00.000Z"),
              updated_at: updatedAt,
              cancelled_at: cancelledAt,
              changeable: false,
              cancellable: false,
            },
          ],
        };
      }

      return {
        rows: [
          {
            id: 101,
            reservation_id: 31,
            people_count: 2,
            has_allergies: true,
            description: "Peanuts",
          },
        ],
      };
    });

    const result = await reservationRepository.getUpcomingBookingsByHikerId(12);

    assert.deepEqual(result, [
      {
        id: 31,
        partySize: 4,
        status: "confirmed",
        slot: { id: 7, startAt, endAt },
        createdAt,
        updatedAt,
        cancelledAt: null,
        changeable: true,
        cancellable: true,
        requirements: [
          {
            id: 101,
            peopleCount: 2,
            hasAllergies: true,
            description: "Peanuts",
          },
        ],
      },
      {
        id: 32,
        partySize: 2,
        status: "cancelled",
        slot: {
          id: 8,
          startAt: new Date("2099-12-16T11:00:00.000Z"),
          endAt: new Date("2099-12-16T13:00:00.000Z"),
        },
        createdAt,
        updatedAt,
        cancelledAt,
        changeable: false,
        cancellable: false,
        requirements: [],
      },
    ]);
    assert.equal(queryMock.mock.callCount(), 2);
    assert.deepEqual(queryMock.mock.calls[0].arguments[1], [12]);
    assert.match(queryMock.mock.calls[0].arguments[0], /s\.end_at > NOW\(\)/);
    assert.match(queryMock.mock.calls[0].arguments[0], /r\.cancelled_at/);
    assert.match(
      queryMock.mock.calls[0].arguments[0],
      /WHEN r\.status = 'cancelled'\s+THEN false\s+WHEN s\.end_at > NOW\(\)\s+THEN true\s+ELSE false\s+END as cancellable/,
    );
    assert.deepEqual(queryMock.mock.calls[1].arguments[1], [[31, 32]]);
  });

  it("returns an empty list without querying requirements when the hiker has no upcoming bookings", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [] }));

    assert.deepEqual(
      await reservationRepository.getUpcomingBookingsByHikerId(12),
      [],
    );
    assert.equal(queryMock.mock.callCount(), 1);
  });

  it("locks only the requested reservation owned by the hiker", async () => {
    const rows = [{ id: 31, hiker_id: 12, status: "confirmed" }];
    const client = {
      query: mock.fn(async () => ({ rows })),
    };

    assert.equal(
      await reservationRepository.getBookingForUpdate(client, 31, 12),
      rows[0],
    );
    assert.match(client.query.mock.calls[0].arguments[0], /r\.id = \$1 AND r\.hiker_id = \$2/);
    assert.deepEqual(client.query.mock.calls[0].arguments[1], [31, 12]);
    assert.match(client.query.mock.calls[0].arguments[0], /FOR UPDATE OF r/);
  });
});
