import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/database/connection.js";
import { createSlot, copySlot, getSlotById } from "../../../src/services/slot.service.js";

const REPO_DATE = "2097-05-10";

async function clearRepoSlots() {
  await pool.query("DELETE FROM slot_table WHERE slot_id IN (SELECT id FROM slot WHERE start_at >= '2097-01-01' AND start_at < '2098-01-01')");
  await pool.query("DELETE FROM slot WHERE start_at >= '2097-01-01' AND start_at < '2098-01-01'");
}

before(async () => {
  await clearRepoSlots();
});

beforeEach(async () => {
  await clearRepoSlots();
});

after(async () => {
  await clearRepoSlots();
  await pool.end();
});

describe("slots repository and service integration", () => {
  it("persists a created slot and its tables in PostgreSQL", async () => {
    const slot = await createSlot(
      {
        startAt: `${REPO_DATE}T12:00:00+01:00`,
        endAt: `${REPO_DATE}T13:00:00+01:00`,
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 6 },
        ],
      },
      1
    );

    assert.ok(slot.id);
    assert.equal(slot.totalSeats, 10);

    const fetched = await getSlotById(slot.id);
    assert.equal(fetched.id, slot.id);
    assert.equal(fetched.tables.length, 2);
  });

  it("ensures freeSeats equals total seats for a newly created slot", async () => {
    const slot = await createSlot(
      {
        startAt: `${REPO_DATE}T12:00:00+01:00`,
        endAt: `${REPO_DATE}T13:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 6 }],
      },
      1
    );

    const fetched = await getSlotById(slot.id);
    assert.equal(fetched.tables[0].freeSeats, 6);
  });

  it("copies tables from an existing slot using database transaction", async () => {
    const sourceSlot = await createSlot(
      {
        startAt: `${REPO_DATE}T12:00:00+01:00`,
        endAt: `${REPO_DATE}T13:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 8 }],
      },
      1
    );

    const copiedSlot = await copySlot(
      {
        startAt: `${REPO_DATE}T13:00:00+01:00`,
        endAt: `${REPO_DATE}T14:00:00+01:00`,
        copyTablesFromSlotId: sourceSlot.id,
      },
      1
    );

    assert.equal(copiedSlot.totalSeats, 8);
    assert.equal(copiedSlot.tables[0].tableNumber, 1);
  });

  it("allows creation of adjacent slots without triggering SLOT_OVERLAP", async () => {
    await createSlot(
      {
        startAt: `${REPO_DATE}T12:00:00+01:00`,
        endAt: `${REPO_DATE}T13:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 4 }],
      },
      1
    );

    const slotB = await createSlot(
      {
        startAt: `${REPO_DATE}T13:00:00+01:00`,
        endAt: `${REPO_DATE}T14:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 4 }],
      },
      1
    );

    assert.ok(slotB.id);
  });

  it("throws ConflictError when slot overlaps", async () => {
    await createSlot(
      {
        startAt: `${REPO_DATE}T12:00:00+01:00`,
        endAt: `${REPO_DATE}T13:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 4 }],
      },
      1
    );

    await assert.rejects(
      async () => {
        await createSlot(
          {
            startAt: `${REPO_DATE}T12:30:00+01:00`,
            endAt: `${REPO_DATE}T13:30:00+01:00`,
            tables: [{ tableNumber: 2, seats: 4 }],
          },
          1
        );
      },
      (err) => err.code === "SLOT_OVERLAP"
    );
  });

  it("throws NotFoundError when source slot to copy from does not exist", async () => {
    await assert.rejects(
      async () => {
        await copySlot(
          {
            startAt: `${REPO_DATE}T12:00:00+01:00`,
            endAt: `${REPO_DATE}T13:00:00+01:00`,
            copyTablesFromSlotId: 999999,
          },
          1
        );
      },
      (err) => err.code === "SLOT_NOT_FOUND"
    );
  });
});