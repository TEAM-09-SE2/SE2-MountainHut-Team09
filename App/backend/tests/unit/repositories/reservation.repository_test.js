import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";

afterEach(() => {
  mock.reset();
});

describe("MH-06 reservation repository", () => {
  it("maps upcoming bookings and their requirements into the API response shape", async () => {
    const startAt = new Date("2099-12-15T11:00:00.000Z");
    const endAt = new Date("2099-12-15T13:00:00.000Z");
    const updatedAt = new Date("2099-10-01T10:00:00.000Z");
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
              start_at: startAt,
              end_at: endAt,
              updated_at: updatedAt,
              changeable: true,
            },
            {
              id: 32,
              hiker_id: 12,
              slot_id: 8,
              party_size: 2,
              status: "cancelled",
              start_at: new Date("2099-12-16T11:00:00.000Z"),
              end_at: new Date("2099-12-16T13:00:00.000Z"),
              updated_at: updatedAt,
              changeable: false,
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
        slotId: 7,
        partySize: 4,
        status: "confirmed",
        startAt,
        endAt,
        updatedAt,
        changeable: true,
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
        slotId: 8,
        partySize: 2,
        status: "cancelled",
        startAt: new Date("2099-12-16T11:00:00.000Z"),
        endAt: new Date("2099-12-16T13:00:00.000Z"),
        updatedAt,
        changeable: false,
        requirements: [],
      },
    ]);
    assert.equal(queryMock.mock.callCount(), 2);
    assert.deepEqual(queryMock.mock.calls[0].arguments[1], [12]);
    assert.match(queryMock.mock.calls[0].arguments[0], /s\.end_at > NOW\(\)/);
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
