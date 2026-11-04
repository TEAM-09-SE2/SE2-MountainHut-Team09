import { before, after, describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/database/connection.js";
import app from "../../../src/app.js";

const server = app.listen(0, "127.0.0.1");
let baseUrl;

const CTRL_DATE = "2096-05-10";

async function clearCtrlSlots() {
  await pool.query("DELETE FROM slot_table WHERE slot_id IN (SELECT id FROM slot WHERE start_at >= '2096-01-01' AND start_at < '2097-01-01')").catch(() => {});
  await pool.query("DELETE FROM slot WHERE start_at >= '2096-01-01' AND start_at < '2097-01-01'").catch(() => {});
}

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/slots`;
  await clearCtrlSlots();
});

after(async () => {
  await clearCtrlSlots();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

beforeEach(async () => {
  await clearCtrlSlots();
});

describe("slots controller and service integration", () => {
  describe("POST /api/v1/slots", () => {
    it("returns 201 with created slot on valid payload", async () => {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startAt: `${CTRL_DATE}T12:00:00+01:00`,
          endAt: `${CTRL_DATE}T13:00:00+01:00`,
          tables: [{ tableNumber: 1, seats: 4 }],
        }),
      });

      const body = await response.json();
      assert.equal(response.status, 201);
      assert.ok(body.id);
      assert.equal(body.totalSeats, 4);
    });

    it("returns 400 INVALID_INPUT if input validation fails", async () => {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startAt: `${CTRL_DATE}T12:00:00+01:00`,
          endAt: `${CTRL_DATE}T13:00:00+01:00`,
          tables: [],
        }),
      });

      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.error, "INVALID_INPUT");
    });
  });

  describe("GET /api/v1/slots/:id", () => {
    it("returns 404 SLOT_NOT_FOUND when slot does not exist", async () => {
      const response = await fetch(`${baseUrl}/999999`);
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.equal(body.error, "SLOT_NOT_FOUND");
    });
  });
});