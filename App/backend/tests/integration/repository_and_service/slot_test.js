import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/database/connection.js";
import { createSlot, copySlot, getSlotById, listMenus, updateSlotMenu } from "../../../src/services/slot.service.js";
import { randomUUID } from "node:crypto";
import authRepository from "../../../src/database/auth.repository.js";
import { hashPassword } from "../../../src/utils/cryptoUtils.js";

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

  it("persists a menu change and clears it from slot details", async () => {
    const slot = await createSlot({
      startAt: `${REPO_DATE}T12:00:00Z`,
      endAt: `${REPO_DATE}T13:00:00Z`,
      tables: [{ tableNumber: 1, seats: 4 }],
    }, creatorId);

    assert.deepEqual(await updateSlotMenu(slot.id, " Soup "), { slotId: slot.id, menu: "Soup" });
    assert.equal((await getSlotById(slot.id)).menu, "Soup");
    assert.deepEqual(await updateSlotMenu(slot.id, null), { slotId: slot.id, menu: null });
    assert.equal((await getSlotById(slot.id)).menu, null);
  });

  it("keeps the menu once a slot has started even while it is still running", async () => {
    const { rows: [{ id }] } = await pool.query(
      `INSERT INTO slot (start_at, end_at, created_by, menu)
       VALUES (now() - interval '1 hour', now() + interval '1 hour', $1, 'Soup')
       RETURNING id`,
      [creatorId],
    );

    await assert.rejects(updateSlotMenu(id, "Pasta"), { code: "SLOT_STARTED" });
    await assert.rejects(updateSlotMenu(id, null), { code: "SLOT_STARTED" });
    assert.equal((await getSlotById(id)).menu, "Soup");
  });

  it("lists distinct menu texts by latest slot time and omits slots without a menu", async () => {
    const soup = `Soup ${randomUUID()}`;
    const fixtures = [
      { startAt: "2097-05-10T12:00:00.000Z", menu: soup.toLowerCase() },
      { startAt: "2097-05-10T10:00:00.000Z", menu: soup },
      { startAt: "2000-05-10T10:00:00.000Z", menu: soup },
      { startAt: "2097-05-10T14:00:00.000Z", menu: null },
      { startAt: "2000-05-10T12:00:00.000Z", menu: `${soup} and bread` },
    ];
    const slots = [];
    for (const { startAt, menu } of fixtures) {
      const { rows: [{ id }] } = await pool.query(
        `INSERT INTO slot (start_at, end_at, created_by, menu)
         VALUES ($1::timestamptz, $1::timestamptz + interval '1 hour', $2, $3)
         RETURNING id`,
        [startAt, creatorId, menu],
      );
      slots.push({ menu, lastSlot: { id, startAt } });
    }

    const fixtureIds = new Set(slots.map(({ lastSlot }) => lastSlot.id));
    const menus = (await listMenus()).filter(({ lastSlot }) => fixtureIds.has(lastSlot.id));
    assert.deepEqual(menus, [slots[0], slots[1], slots[4]]);
  });
});
