import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/database/connection.js";
import slotRepository from "../../../src/database/slot.repository.js";

describe("slotRepository.findSlotsByDate unit (MH-11)", () => {
  it("maps s.menu directly for each slot and preserves null when undefined", async (t) => {
    const queryMock = t.mock.method(pool, "query", async () => ({
      rows: [
        {
          id: 10,
          start_at: "2095-06-15T10:00:00.000Z",
          end_at: "2095-06-15T12:00:00.000Z",
          total_seats: 12,
          free_seats: 8,
          bookable: true,
          menu: "* **Lunch**: Canederli in brodo",
        },
        {
          id: 11,
          start_at: "2095-06-15T17:00:00.000Z",
          end_at: "2095-06-15T19:00:00.000Z",
          total_seats: 12,
          free_seats: 12,
          bookable: true,
          menu: null,
        },
      ],
    }));

    const slots = await slotRepository.findSlotsByDate("2095-06-15");

    assert.equal(queryMock.mock.callCount(), 1);
    const [sql, params] = queryMock.mock.calls[0].arguments;
    assert.match(sql, /s\.menu/);
    assert.deepEqual(params, ["2095-06-15"]);

    assert.equal(slots.length, 2);
    assert.equal(slots[0].menu, "* **Lunch**: Canederli in brodo");
    assert.equal(slots[1].menu, null);
  });
});