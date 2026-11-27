import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/database/connection.js";
import { createSlot, copySlot, getSlotById } from "../../../src/services/slot.service.js";
import { randomUUID } from "node:crypto";
import authRepository from "../../../src/database/auth.repository.js";
import { hashPassword } from "../../../src/utils/cryptoUtils.js";
import slotRepository from "../../../src/database/slot.repository.js";

const REPO_DATE = "2097-05-10";
const CREATOR_EMAIL_PATTERN = "slot-repo-%@example.com";
let creatorId;

async function clearRepoSlots() {
  await pool.query(
    "DELETE FROM reservation WHERE slot_id IN (SELECT id FROM slot WHERE created_by IN (SELECT id FROM app_user WHERE email LIKE $1))",
    [CREATOR_EMAIL_PATTERN],
  );
  await pool.query(
    "DELETE FROM slot WHERE created_by IN (SELECT id FROM app_user WHERE email LIKE $1)",
    [CREATOR_EMAIL_PATTERN],
  );
}

before(async () => {
  await clearRepoSlots();
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [CREATOR_EMAIL_PATTERN]);
  await pool.query("ALTER TABLE slot ADD COLUMN IF NOT EXISTS menu TEXT");
  const { hash, salt } = hashPassword("SlotCreator123!");
  const user = await authRepository.createUser({
    email: `slot-repo-${randomUUID()}@example.com`, hash, salt,
    firstName: "Slot", lastName: "Creator", role: "warden",
  });
  creatorId = user.id;
});

beforeEach(async () => {
  await clearRepoSlots();
});

after(async () => {
  await clearRepoSlots();
  if (creatorId) await pool.query("DELETE FROM app_user WHERE id = $1", [creatorId]);
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
      creatorId
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
      creatorId
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
      creatorId
    );

    const copiedSlot = await copySlot(
      {
        startAt: `${REPO_DATE}T13:00:00+01:00`,
        endAt: `${REPO_DATE}T14:00:00+01:00`,
        copyTablesFromSlotId: sourceSlot.id,
      },
      creatorId
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
      creatorId
    );

    const slotB = await createSlot(
      {
        startAt: `${REPO_DATE}T13:00:00+01:00`,
        endAt: `${REPO_DATE}T14:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 4 }],
      },
      creatorId
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
      creatorId
    );

    await assert.rejects(
      async () => {
        await createSlot(
          {
            startAt: `${REPO_DATE}T12:30:00+01:00`,
            endAt: `${REPO_DATE}T13:30:00+01:00`,
            tables: [{ tableNumber: 2, seats: 4 }],
          },
          creatorId
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
          creatorId
        );
      },
      (err) => err.code === "SLOT_NOT_FOUND"
    );
  });

  describe("findSlotsByDate with menu (MH-11)", () => {
    it("returns each slot's own menu without falling back to another slot's menu on the same day", async () => {
      const lunch = await createSlot(
        {
          startAt: `${REPO_DATE}T12:00:00+02:00`,
          endAt: `${REPO_DATE}T14:00:00+02:00`,
          tables: [{ tableNumber: 1, seats: 6 }],
        },
        creatorId,
      );
      const dinner = await createSlot(
        {
          startAt: `${REPO_DATE}T19:00:00+02:00`,
          endAt: `${REPO_DATE}T21:00:00+02:00`,
          tables: [{ tableNumber: 1, seats: 6 }],
        },
        creatorId,
      );

      const formattedMenu = "**Primo**: Pizzoccheri\n- *Allergeni*: glutine, latticini";
      await pool.query("UPDATE slot SET menu = $1 WHERE id = $2", [formattedMenu, lunch.id]);

      const slots = await slotRepository.findSlotsByDate(REPO_DATE);

      assert.equal(slots.length, 2);
      assert.equal(slots[0].id, lunch.id);
      assert.equal(slots[0].menu, formattedMenu);
      assert.equal(slots[1].id, dinner.id);
      assert.equal(slots[1].menu, null);
    });
  });
});
