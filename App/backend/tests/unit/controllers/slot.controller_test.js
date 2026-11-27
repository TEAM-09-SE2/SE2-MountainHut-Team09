import { describe, it } from "node:test";
import assert from "node:assert/strict";
import slotController from "../../../src/controllers/slot.controller.js";
import slotRepository from "../../../src/database/slot.repository.js";

describe("slotController.getSlotsByDate unit (MH-11)", () => {
  it("returns slots with their menu field (string or null) for a valid date", async (t) => {
    const expectedSlots = [
      {
        id: 1,
        startAt: "2095-06-15T12:00:00.000Z",
        endAt: "2095-06-15T14:00:00.000Z",
        totalSeats: 20,
        freeSeats: 14,
        bookable: true,
        menu: "**Primo**: Polenta e funghi\n- **Dolce**: Strudel",
      },
      {
        id: 2,
        startAt: "2095-06-15T19:00:00.000Z",
        endAt: "2095-06-15T21:00:00.000Z",
        totalSeats: 20,
        freeSeats: 20,
        bookable: true,
        menu: null,
      },
    ];

    const findMock = t.mock.method(slotRepository, "findSlotsByDate", async () => expectedSlots);

    let jsonPayload = null;
    const req = { query: { date: "2095-06-15" } };
    const res = {
      json(data) {
        jsonPayload = data;
      },
    };

    await slotController.getSlotsByDate(req, res);

    assert.equal(findMock.mock.callCount(), 1);
    assert.deepEqual(findMock.mock.calls[0].arguments, ["2095-06-15"]);
    assert.deepEqual(jsonPayload, expectedSlots);
    assert.equal(jsonPayload[0].menu, "**Primo**: Polenta e funghi\n- **Dolce**: Strudel");
    assert.equal(jsonPayload[1].menu, null);
  });

  it("throws BadRequestError (INVALID_DATE) when date is missing, malformed, or non-existent", async (t) => {
    const findMock = t.mock.method(slotRepository, "findSlotsByDate", async () => []);

    for (const badDate of [undefined, "", "15-06-2026", "2026-02-30"]) {
      await assert.rejects(
        () => slotController.getSlotsByDate({ query: { date: badDate } }, { json() {} }),
        (err) => err.code === "INVALID_DATE" && err.statusCode === 400,
      );
    }

    assert.equal(findMock.mock.callCount(), 0);
  });
});