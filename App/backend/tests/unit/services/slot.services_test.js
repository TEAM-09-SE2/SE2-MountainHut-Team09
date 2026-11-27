import { describe, it } from "node:test";
import assert from "node:assert/strict";
import slotRepository from "../../../src/database/slot.repository.js";
import { createSlot, copySlot, getSlotById, updateSlotMenu } from "../../../src/services/slot.service.js";

describe("slotService unit", () => {
  describe("createSlot", () => {
    it("returns created slot on success", async () => {
      const mockSlot = { id: 1, startAt: "2026-11-01T12:00:00Z", endAt: "2026-11-01T13:00:00Z", totalSeats: 4, tables: [] };
      const originalCreate = slotRepository.createSlot;
      slotRepository.createSlot = async () => ({ overlap: false, slot: mockSlot });

      try {
        const result = await createSlot({ startAt: "2026-11-01T12:00:00Z", endAt: "2026-11-01T13:00:00Z", tables: [] }, 1);
        assert.deepEqual(result, mockSlot);
      } finally {
        slotRepository.createSlot = originalCreate;
      }
    });

    it("throws ConflictError (SLOT_OVERLAP) when slot overlaps", async () => {
      const originalCreate = slotRepository.createSlot;
      slotRepository.createSlot = async () => ({ overlap: true });

      try {
        await assert.rejects(
          async () => createSlot({ startAt: "2026-11-01T12:00:00Z", endAt: "2026-11-01T13:00:00Z", tables: [] }, 1),
          (err) => err.code === "SLOT_OVERLAP"
        );
      } finally {
        slotRepository.createSlot = originalCreate;
      }
    });

    it("propagates unexpected repository errors", async () => {
      const originalCreate = slotRepository.createSlot;
      slotRepository.createSlot = async () => { throw new Error("Database error"); };

      try {
        await assert.rejects(
          async () => createSlot({ startAt: "2026-11-01T12:00:00Z", endAt: "2026-11-01T13:00:00Z", tables: [] }, 1),
          (err) => err.message === "Database error"
        );
      } finally {
        slotRepository.createSlot = originalCreate;
      }
    });
  });

  describe("copySlot", () => {
    it("returns copied slot on success", async () => {
      const mockSlot = { id: 2, totalSeats: 8, tables: [] };
      const originalCopy = slotRepository.copySlot;
      slotRepository.copySlot = async () => ({ overlap: false, sourceNotFound: false, slot: mockSlot });

      try {
        const result = await copySlot({ startAt: "2026-11-01T13:00:00Z", endAt: "2026-11-01T14:00:00Z", copyTablesFromSlotId: 1 }, 1);
        assert.deepEqual(result, mockSlot);
      } finally {
        slotRepository.copySlot = originalCopy;
      }
    });

    it("throws NotFoundError (SLOT_NOT_FOUND) when source slot does not exist", async () => {
      const originalCopy = slotRepository.copySlot;
      slotRepository.copySlot = async () => ({ overlap: false, sourceNotFound: true });

      try {
        await assert.rejects(
          async () => copySlot({ startAt: "2026-11-01T13:00:00Z", endAt: "2026-11-01T14:00:00Z", copyTablesFromSlotId: 99 }, 1),
          (err) => err.code === "SLOT_NOT_FOUND"
        );
      } finally {
        slotRepository.copySlot = originalCopy;
      }
    });

    it("throws ConflictError (SLOT_OVERLAP) when target slot overlaps", async () => {
      const originalCopy = slotRepository.copySlot;
      slotRepository.copySlot = async () => ({ overlap: true });

      try {
        await assert.rejects(
          async () => copySlot({ startAt: "2026-11-01T13:00:00Z", endAt: "2026-11-01T14:00:00Z", copyTablesFromSlotId: 1 }, 1),
          (err) => err.code === "SLOT_OVERLAP"
        );
      } finally {
        slotRepository.copySlot = originalCopy;
      }
    });
  });

  describe("getSlotById", () => {
    it("returns slot details on success", async () => {
      const mockSlot = { id: 1, tables: [] };
      const originalGet = slotRepository.getSlotById;
      slotRepository.getSlotById = async () => mockSlot;

      try {
        const result = await getSlotById(1);
        assert.deepEqual(result, mockSlot);
      } finally {
        slotRepository.getSlotById = originalGet;
      }
    });

    it("throws NotFoundError (SLOT_NOT_FOUND) when slot does not exist", async () => {
      const originalGet = slotRepository.getSlotById;
      slotRepository.getSlotById = async () => null;

      try {
        await assert.rejects(
          async () => getSlotById(999),
          (err) => err.code === "SLOT_NOT_FOUND"
        );
      } finally {
        slotRepository.getSlotById = originalGet;
      }
    });
  });

  describe("updateSlotMenu", () => {
    it("trims surrounding whitespace and keeps the indentation inside the menu", async ({ mock }) => {
      const menu = "- Soup\n  - with bread";
      const update = mock.method(slotRepository, "updateSlotMenu", async (slotId, text) => ({ slotId, menu: text }));

      assert.deepEqual(await updateSlotMenu(7, ` \n${menu}\n `), { slotId: 7, menu });
      assert.deepEqual(update.mock.calls[0].arguments, [7, menu]);
    });

    it("removes a menu for null or a whitespace-only string", async ({ mock }) => {
      const update = mock.method(slotRepository, "updateSlotMenu", async (slotId, menu) => ({ slotId, menu }));

      assert.deepEqual(await updateSlotMenu(7, null), { slotId: 7, menu: null });
      assert.deepEqual(await updateSlotMenu(7, " \n\t "), { slotId: 7, menu: null });
      assert.deepEqual(update.mock.calls.map((call) => call.arguments), [[7, null], [7, null]]);
    });

    it("allows 5,000 Unicode code points after trimming and rejects longer menus", async ({ mock }) => {
      const menu = "🍲".repeat(5000);
      const update = mock.method(slotRepository, "updateSlotMenu", async (slotId, text) => ({ slotId, menu: text }));

      assert.deepEqual(await updateSlotMenu(7, ` ${menu} `), { slotId: 7, menu });
      await assert.rejects(updateSlotMenu(7, `${menu}a`), { statusCode: 400, code: "INVALID_INPUT" });
      assert.equal(update.mock.callCount(), 1);
    });

    it("rejects missing values, non-strings, NUL and lone surrogates before writing", async ({ mock }) => {
      const update = mock.method(slotRepository, "updateSlotMenu");

      for (const menu of [undefined, 12, {}, "Soup\u0000", "Soup\uD800", "Soup\uDC00"]) {
        await assert.rejects(updateSlotMenu(7, menu), { statusCode: 400, code: "INVALID_INPUT" });
      }
      assert.equal(update.mock.callCount(), 0);
    });

    it("reports a missing slot and a slot that has already started", async ({ mock }) => {
      mock.method(slotRepository, "updateSlotMenu", async (slotId) => slotId === 7 ? null : { started: true });

      await assert.rejects(updateSlotMenu(7, "Soup"), { statusCode: 404, code: "SLOT_NOT_FOUND" });
      await assert.rejects(updateSlotMenu(8, "Soup"), { statusCode: 422, code: "SLOT_STARTED" });
    });
  });
});
