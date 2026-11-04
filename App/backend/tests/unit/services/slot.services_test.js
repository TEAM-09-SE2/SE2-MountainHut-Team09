import { describe, it } from "node:test";
import assert from "node:assert/strict";
import slotRepository from "../../../src/database/slot.repository.js";
import { createSlot, copySlot, getSlotById } from "../../../src/services/slot.service.js";

describe("slotService unit", () => {
  it("createSlot throws ConflictError when repository returns overlap", async () => {
    const originalCreate = slotRepository.createSlot;
    slotRepository.createSlot = async () => ({ overlap: true });

    try {
      await assert.rejects(
        async () => {
          await createSlot(
            {
              startAt: "2026-11-01T12:00:00+01:00",
              endAt: "2026-11-01T13:00:00+01:00",
              tables: [{ tableNumber: 1, seats: 4 }],
            },
            1
          );
        },
        (err) => err.code === "SLOT_OVERLAP"
      );
    } finally {
      slotRepository.createSlot = originalCreate;
    }
  });

  it("copySlot throws NotFoundError when source slot does not exist", async () => {
    const originalCopy = slotRepository.copySlot;
    slotRepository.copySlot = async () => ({ overlap: false, sourceNotFound: true });

    try {
      await assert.rejects(
        async () => {
          await copySlot(
            {
              startAt: "2026-11-01T12:00:00+01:00",
              endAt: "2026-11-01T13:00:00+01:00",
              copyTablesFromSlotId: 99,
            },
            1
          );
        },
        (err) => err.code === "SLOT_NOT_FOUND"
      );
    } finally {
      slotRepository.copySlot = originalCopy;
    }
  });

  it("getSlotById throws NotFoundError when repository returns null", async () => {
    const originalGet = slotRepository.getSlotById;
    slotRepository.getSlotById = async () => null;

    try {
      await assert.rejects(
        async () => {
          await getSlotById(999);
        },
        (err) => err.code === "SLOT_NOT_FOUND"
      );
    } finally {
      slotRepository.getSlotById = originalGet;
    }
  });
});