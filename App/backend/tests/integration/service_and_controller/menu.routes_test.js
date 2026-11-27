import { after, before, it, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import jwt from "jsonwebtoken";
import app from "../../../src/app.js";
import authRepository from "../../../src/database/auth.repository.js";
import slotRepository from "../../../src/database/slot.repository.js";

const secret = "menu-routes-test-secret";
const originalSecret = process.env.JWT_SECRET;
const roles = { employee: 1, warden: 2, hiker: 3 };
let server;
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = secret;
  mock.method(authRepository, "findUserById", async (id) => ({
    id,
    role: Object.keys(roles).find((role) => roles[role] === id),
    mustChangePassword: false,
  }));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  mock.restoreAll();
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});

function menuRequest(path, { role, method = "GET", body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (role) requestHeaders.set("cookie", `token=${jwt.sign({ id: roles[role] }, secret)}`);
  if (body !== undefined && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }
  return fetch(`${baseUrl}${path}`, { method, headers: requestHeaders, body });
}

it("lets employees and wardens save, remove and list menus", async ({ mock }) => {
  const menus = [{ menu: "Soup", lastSlot: { id: 7, startAt: "2097-05-10T10:00:00.000Z" } }];
  const update = mock.method(slotRepository, "updateSlotMenu", async (slotId, menu) => ({ slotId, menu }));
  mock.method(slotRepository, "listMenus", async () => menus);

  for (const role of ["employee", "warden"]) {
    for (const menu of ["Soup", null]) {
      const response = await menuRequest("/slots/7/menu", { role, method: "PUT", body: JSON.stringify({ menu }) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { slotId: 7, menu });
    }

    const response = await menuRequest("/staff/menus", { role });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), menus);
  }
  assert.deepEqual(update.mock.calls.map((call) => call.arguments), [[7, "Soup"], [7, null], [7, "Soup"], [7, null]]);
});

it("requires staff authorization for both menu endpoints", async ({ mock }) => {
  const update = mock.method(slotRepository, "updateSlotMenu", async () => ({ slotId: 7, menu: "Soup" }));
  const list = mock.method(slotRepository, "listMenus", async () => []);

  for (const [role, status, error] of [[undefined, 401, "NOT_AUTHENTICATED"], ["hiker", 403, "FORBIDDEN_ROLE"]]) {
    const write = await menuRequest("/slots/7/menu", { role, method: "PUT", body: '{"menu":"Soup"}' });
    const read = await menuRequest("/staff/menus", { role });
    for (const response of [write, read]) {
      assert.equal(response.status, status);
      assert.equal((await response.json()).error, error);
    }
  }
  assert.equal(update.mock.callCount(), 0);
  assert.equal(list.mock.callCount(), 0);
});

it("returns the menu API errors for invalid, missing and started slots", async ({ mock }) => {
  const update = mock.method(slotRepository, "updateSlotMenu", async (slotId) => slotId === 7 ? null : { started: true });
  const cases = [
    { id: "1.5", status: 400, error: "INVALID_INPUT" },
    { id: "2147483648", status: 400, error: "INVALID_INPUT" },
    { id: "7", body: "{}", status: 400, error: "INVALID_INPUT" },
    { id: "7", body: JSON.stringify({ menu: "Soup\u0000" }), status: 400, error: "INVALID_INPUT" },
    { id: "7", body: JSON.stringify({ menu: "Soup\uD800" }), status: 400, error: "INVALID_INPUT" },
    { id: "7", status: 404, error: "SLOT_NOT_FOUND" },
    { id: "8", status: 422, error: "SLOT_STARTED" },
  ];

  for (const { id, body = '{"menu":"Soup"}', status, error } of cases) {
    const response = await menuRequest(`/slots/${id}/menu`, { role: "employee", method: "PUT", body });
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, error);
  }
  assert.deepEqual(update.mock.calls.map((call) => call.arguments), [[7, "Soup"], [8, "Soup"]]);
});

it("maps URL decoding and body parser failures to JSON errors", async ({ mock }) => {
  const update = mock.method(slotRepository, "updateSlotMenu", async () => ({ slotId: 7, menu: "Soup" }));
  const cases = [
    { id: "%ZZ", status: 400, error: "INVALID_INPUT", message: /path parameter/ },
    { body: '{"menu":', status: 400, error: "INVALID_INPUT", message: /malformed JSON/ },
    { body: JSON.stringify({ menu: "a".repeat(110 * 1024) }), status: 413, error: "PAYLOAD_TOO_LARGE", message: /allowed size/ },
    { headers: { "content-type": "application/json; charset=iso-8859-1" }, status: 415, error: "UNSUPPORTED_MEDIA_TYPE", message: /unsupported charset/ },
    { headers: { "content-encoding": "unknown" }, status: 415, error: "UNSUPPORTED_MEDIA_TYPE", message: /unsupported charset/ },
  ];

  for (const { id = "7", body = '{"menu":"Soup"}', headers, status, error, message } of cases) {
    const response = await menuRequest(`/slots/${id}/menu`, { role: "employee", method: "PUT", body, headers });
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(result.error, error);
    assert.match(result.message, message);
  }
  assert.equal(update.mock.callCount(), 0);
});

it("accepts a gzip JSON body and returns 400 for a truncated gzip body", async ({ mock }) => {
  const update = mock.method(slotRepository, "updateSlotMenu", async (slotId, menu) => ({ slotId, menu }));
  const body = gzipSync('{"menu":"Soup"}');
  const options = { role: "employee", method: "PUT", headers: { "content-encoding": "gzip" } };

  const valid = await menuRequest("/slots/7/menu", { ...options, body });
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { slotId: 7, menu: "Soup" });

  const invalid = await menuRequest("/slots/7/menu", { ...options, body: body.subarray(0, -4) });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "INVALID_INPUT", message: "The request body could not be read." });
  assert.equal(update.mock.callCount(), 1);
});
