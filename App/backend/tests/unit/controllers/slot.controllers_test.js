import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSlotController, getSlotByIdController } from "../../../src/controllers/slot.controllers.js";

describe("slotController unit", () => {
  describe("createSlotController validation", () => {
    it("forwards error to next when body is missing or not an object", async () => {
      const req = { body: null };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when startAt or endAt has an invalid calendar date", async () => {
      const req = {
        body: {
          startAt: "2026-11-31T12:00:00+01:00", // November 31st does not exist
          endAt: "2026-11-31T13:00:00+01:00",
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when endAt is before or equal to startAt", async () => {
      const req = {
        body: {
          startAt: "2026-11-01T13:00:00+01:00",
          endAt: "2026-11-01T12:00:00+01:00",
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when neither tables nor copyTablesFromSlotId is sent", async () => {
      const req = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when both tables and copyTablesFromSlotId are sent", async () => {
      const req = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
          tables: [{ tableNumber: 1, seats: 4 }],
          copyTablesFromSlotId: 10,
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when tables field is an empty array or not an array", async () => {
      const req = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
          tables: [],
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when table numbers or seats are decimal, non-positive, or overflow", async () => {
      // Case 1: Decimal seats
      const reqDecimal = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
          tables: [{ tableNumber: 1, seats: 2.5 }],
        },
      };
      let passedError = null;
      await createSlotController(reqDecimal, {}, (err) => {
        passedError = err;
      });
      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");

      // Case 2: Max integer overflow (> 2147483647)
      const reqOverflow = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
          tables: [{ tableNumber: 1, seats: 3000000000 }],
        },
      };
      passedError = null;
      await createSlotController(reqOverflow, {}, (err) => {
        passedError = err;
      });
      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when table numbers are duplicate", async () => {
      const req = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
          tables: [
            { tableNumber: 1, seats: 4 },
            { tableNumber: 1, seats: 2 },
          ],
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });

    it("forwards error to next when copyTablesFromSlotId is not a positive integer", async () => {
      const req = {
        body: {
          startAt: "2026-11-01T12:00:00+01:00",
          endAt: "2026-11-01T13:00:00+01:00",
          copyTablesFromSlotId: -1,
        },
      };
      let passedError = null;

      await createSlotController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });
  });

  describe("getSlotByIdController validation", () => {
    it("forwards error to next when slot id parameter is missing or not a positive integer", async () => {
      const req = { params: { id: "abc" } };
      let passedError = null;

      await getSlotByIdController(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.code, "INVALID_INPUT");
    });
  });
});