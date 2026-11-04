import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = "slots-e2e-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

const E2E_DATE_CYCLE = "2098-05-10";
const E2E_DATE_ERRORS = "2098-05-11";

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = "test";

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/slots`;
});

after(async () => {
  await pool.query("DELETE FROM slot_table WHERE slot_id IN (SELECT id FROM slot WHERE start_at >= '2098-01-01')").catch(() => {});
  await pool.query("DELETE FROM slot WHERE start_at >= '2098-01-01'").catch(() => {});

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  await pool.end();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

function createAuthCookie(role = "staff", userId = 1) {
  const token = jwt.sign(
    { id: userId, email: `${role}@example.com`, role },
    testJwtSecret
  );
  return `token=${token}`;
}

async function sendRequest(path = "", { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function cleanupSlot(slotId) {
  if (!slotId) return;
  await pool.query("DELETE FROM slot_table WHERE slot_id = $1", [slotId]).catch(() => {});
  await pool.query("DELETE FROM slot WHERE id = $1", [slotId]).catch(() => {});
}

describe("slots end-to-end", () => {
  it("completes full creation, retrieval, and copying cycle", async (t) => {
    const staffCookie = createAuthCookie("staff");

    const startAt = `${E2E_DATE_CYCLE}T12:00:00+01:00`;
    const endAt = `${E2E_DATE_CYCLE}T13:00:00+01:00`;
    const copyStartAt = `${E2E_DATE_CYCLE}T13:00:00+01:00`;
    const copyEndAt = `${E2E_DATE_CYCLE}T14:00:00+01:00`;

    // 1. Create a slot with explicit tables
    const createPayload = {
      startAt,
      endAt,
      tables: [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 6 },
      ],
    };

    const createResponse = await sendRequest("", {
      method: "POST",
      body: createPayload,
      cookie: staffCookie,
    });
    const createdSlot = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.ok(createdSlot.id);
    assert.equal(new Date(createdSlot.startAt).toISOString(), new Date(createPayload.startAt).toISOString());
    assert.equal(new Date(createdSlot.endAt).toISOString(), new Date(createPayload.endAt).toISOString());
    assert.equal(createdSlot.totalSeats, 10);
    assert.equal(createdSlot.tables.length, 2);

    t.after(async () => {
      await cleanupSlot(createdSlot.id);
    });

    // 2. Fetch slot by ID
    const getResponse = await sendRequest(`/${createdSlot.id}`, {
      cookie: staffCookie,
    });
    const fetchedSlot = await getResponse.json();

    assert.equal(getResponse.status, 200);
    assert.equal(fetchedSlot.id, createdSlot.id);
    assert.equal(fetchedSlot.totalSeats, 10);
    assert.equal(fetchedSlot.tables.length, 2);
    assert.ok("freeSeats" in fetchedSlot.tables[0]);

    // 3. Create another slot copying tables from the first slot
    const copyPayload = {
      startAt: copyStartAt,
      endAt: copyEndAt,
      copyTablesFromSlotId: createdSlot.id,
    };

    const copyResponse = await sendRequest("", {
      method: "POST",
      body: copyPayload,
      cookie: staffCookie,
    });
    const copiedSlot = await copyResponse.json();

    assert.equal(copyResponse.status, 201);
    assert.ok(copiedSlot.id);
    assert.equal(copiedSlot.totalSeats, 10);
    assert.equal(copiedSlot.tables.length, 2);

    t.after(async () => {
      await cleanupSlot(copiedSlot.id);
    });
  });

  it("handles validation, overlap and missing slot errors", async (t) => {
    const staffCookie = createAuthCookie("staff");

    // Invalid dates (endAt before startAt)
    const invalidDatesRes = await sendRequest("", {
      method: "POST",
      body: {
        startAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`,
        endAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 4 }],
      },
      cookie: staffCookie,
    });
    const invalidDatesError = await invalidDatesRes.json();
    assert.equal(invalidDatesRes.status, 400);
    assert.equal(invalidDatesError.error, "INVALID_INPUT");

    // Copying from non-existent slot
    const notFoundCopyRes = await sendRequest("", {
      method: "POST",
      body: {
        startAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`,
        endAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`,
        copyTablesFromSlotId: 999999,
      },
      cookie: staffCookie,
    });
    const notFoundCopyError = await notFoundCopyRes.json();
    assert.equal(notFoundCopyRes.status, 404);
    assert.equal(notFoundCopyError.error, "SLOT_NOT_FOUND");

    // Slot overlap testing
    const baseSlotRes = await sendRequest("", {
      method: "POST",
      body: {
        startAt: `${E2E_DATE_ERRORS}T12:00:00+01:00`,
        endAt: `${E2E_DATE_ERRORS}T13:00:00+01:00`,
        tables: [{ tableNumber: 1, seats: 4 }],
      },
      cookie: staffCookie,
    });
    assert.equal(baseSlotRes.status, 201);
    const baseSlot = await baseSlotRes.json();

    t.after(async () => {
      await cleanupSlot(baseSlot.id);
    });

    const overlapRes = await sendRequest("", {
      method: "POST",
      body: {
        startAt: `${E2E_DATE_ERRORS}T12:30:00+01:00`,
        endAt: `${E2E_DATE_ERRORS}T13:30:00+01:00`,
        tables: [{ tableNumber: 2, seats: 4 }],
      },
      cookie: staffCookie,
    });
    const overlapError = await overlapRes.json();
    assert.equal(overlapRes.status, 409);
    assert.equal(overlapError.error, "SLOT_OVERLAP");
  });
});