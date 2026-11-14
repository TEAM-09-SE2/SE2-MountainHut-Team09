import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import net from "node:net";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const TEST_EMAIL_PATTERN = "requirements-e2e-%";
const PASSWORD = "password123";
const TEST_VARIABLES = ["JWT_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"];
const originalEnv = Object.fromEntries(TEST_VARIABLES.map((name) => [name, process.env[name]]));
const server = app.listen(0, "127.0.0.1");
const inbox = [];
let baseUrl;
let employeeCookie;
let wardenCookie;

//Minimal SMTP server: accepts every message and keeps its recipients and decoded plain-text part
const smtpServer = net.createServer((socket) => {
  let buffer = "";
  let to = [];
  let data = null;
  const reply = (line) => socket.write(`${line}\r\n`);
  socket.on("error", () => {});
  reply("220 localhost ESMTP");
  socket.on("data", (chunk) => {
    buffer += chunk.toString("latin1");
    let end;
    while ((end = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line === ".") {
          inbox.push({ to, text: plainText(data.join("\r\n")) });
          data = null;
          reply("250 OK");
        } else {
          data.push(line.startsWith(".") ? line.slice(1) : line);
        }
        continue;
      }
      const command = line.slice(0, 4).toUpperCase();
      if (command === "MAIL") to = [];
      if (command === "RCPT") to.push(line.match(/<(.*)>/)[1]);
      if (command === "DATA") {
        data = [];
        reply("354 End data with <CR><LF>.<CR><LF>");
      } else if (command === "QUIT") {
        reply("221 Bye");
        socket.end();
      } else {
        reply("250 OK");
      }
    }
  });
});

function plainText(raw) {
  const boundary = raw.match(/boundary="([^"]+)"/)[1];
  const part = raw.split(`--${boundary}`).find((section) => section.includes("Content-Type: text/plain"));
  const separator = part.indexOf("\r\n\r\n");
  const headers = part.slice(0, separator);
  const body = part.slice(separator + 4);
  if (/Content-Transfer-Encoding: base64/i.test(headers)) return Buffer.from(body, "base64").toString("utf8");
  const bytes = body.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

async function listen(target) {
  await new Promise((resolve, reject) => {
    target.once("error", reject);
    target.listen(0, "127.0.0.1", () => resolve());
  });
  return target.address().port;
}

async function purgeTestData() {
  const testUsers = "SELECT id FROM app_user WHERE email LIKE $1";
  await pool.query(`DELETE FROM reservation WHERE hiker_id IN (${testUsers}) OR slot_id IN (SELECT id FROM slot WHERE created_by IN (${testUsers}))`, [TEST_EMAIL_PATTERN]);
  await pool.query(`DELETE FROM slot WHERE created_by IN (${testUsers})`, [TEST_EMAIL_PATTERN]);
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_PATTERN]);
}

//Creates the user in the database and logs in through the API, as the app would
async function createUserAndLogin(role, firstName, lastName) {
  const email = `requirements-e2e-${randomUUID()}@example.com`;
  const { salt, hash } = hashPassword(PASSWORD);
  const { rows: [user] } = await pool.query(
    "INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [email, hash, salt, firstName, lastName, role],
  );
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const token = response.headers.get("set-cookie").match(/(?:^|,\s*)token=([^;]+)/)[1];
  return { id: user.id, email, cookie: `token=${token}` };
}

async function createSlot(createdBy, startAt, endAt, seatsByTable) {
  const { rows: [slot] } = await pool.query("INSERT INTO slot (start_at, end_at, created_by) VALUES ($1, $2, $3) RETURNING id", [startAt, endAt, createdBy]);
  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    await pool.query("INSERT INTO slot_table (slot_id, table_number, seats) VALUES ($1, $2, $3)", [slot.id, tableNumber, seats]);
  }
  return slot.id;
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const smtpPort = await listen(smtpServer);
  Object.assign(process.env, {
    JWT_SECRET: "requirements-e2e-test-secret",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    MAIL_FROM: "Mountain Hut <noreply@mountainhut.local>",
  });

  await purgeTestData();
  employeeCookie = (await createUserAndLogin("employee", "Giulia", "Bianchi")).cookie;
  wardenCookie = (await createUserAndLogin("warden", "Marco", "Rossi")).cookie;
});

after(async () => {
  try {
    await purgeTestData();
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    smtpServer.close();
    await pool.end();
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

describe("party requirements end-to-end (MH-05)", () => {
  // Verifies the whole flow of the story: the hiker books with three requirements, gets them in the email,
  // and the staff see the booking flagged for allergies with the allergy requirements first.
  it("books with the story's requirements, emails them and shows them to the staff", async () => {
    const hiker = await createUserAndLogin("hiker", "Ada", "Lovelace");
    const slotId = await createSlot(hiker.id, "2094-07-20T12:00:00+02:00", "2094-07-20T13:30:00+02:00", { 1: 4, 2: 4 });

    const booking = await request("/reservations", {
      method: "POST",
      cookie: hiker.cookie,
      body: {
        slotId,
        partySize: 6,
        requirements: [
          { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
          { peopleCount: 1, hasAllergies: true, description: "  Vegan, peanut allergy  " },
          { peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" },
        ],
      },
    });

    assert.equal(booking.status, 201);
    assert.equal(booking.body.confirmationSent, true);
    assert.deepEqual(booking.body.requirements.map(({ peopleCount, hasAllergies, description }) => [peopleCount, hasAllergies, description]), [
      [2, false, "Vegetarians"],
      [1, true, "Vegan, peanut allergy"],
      [1, true, "Shellfish allergy"],
    ]);
    assert.ok(booking.body.requirements.every((requirement) => Number.isInteger(requirement.id)));

    //The hiker's confirmation email lists the requirements, allergies first and marked
    const [email] = inbox.filter((message) => message.to.includes(hiker.email));
    assert.ok(email, "confirmation email received");
    assert.match(email.text, /ALLERGY: 1 × Vegan, peanut allergy\s+ALLERGY: 1 × Shellfish allergy\s+2 × Vegetarians/);

    //The staff list shows the same booking, flagged and with the allergy requirements first
    const list = await request("/reservations?date=2094-07-20", { cookie: employeeCookie });
    assert.equal(list.status, 200);
    const listed = list.body.find((item) => item.id === booking.body.id);
    assert.ok(listed, "booking in the staff list");
    assert.equal(listed.hasAllergies, true);
    assert.equal(listed.partySize, 6);
    assert.deepEqual(listed.requirements.map((requirement) => requirement.description), ["Vegan, peanut allergy", "Shellfish allergy", "Vegetarians"]);
    assert.deepEqual(new Set(listed.requirements.map((requirement) => requirement.id)), new Set(booking.body.requirements.map((requirement) => requirement.id)));
    assert.equal(listed.hiker.email, hiker.email);
    assert.equal(Object.hasOwn(listed.hiker, "password_hash"), false);
    assert.equal(Object.hasOwn(listed.hiker, "salt"), false);
  });

  // Verifies refused requirements create nothing: no booking, no seats taken, no email.
  it("refuses invalid requirements without booking anything", async () => {
    const hiker = await createUserAndLogin("hiker", "Grace", "Hopper");
    const slotId = await createSlot(hiker.id, "2094-07-21T12:00:00+02:00", "2094-07-21T13:00:00+02:00", { 1: 4 });
    const emailsBefore = inbox.length;

    for (const requirements of [
      [{ peopleCount: 3, hasAllergies: false, description: "Vegetarians" }],
      [{ peopleCount: 1, hasAllergies: "yes", description: "Nut allergy" }],
      [{ peopleCount: 1, hasAllergies: true, description: "   " }],
    ]) {
      const response = await request("/reservations", { method: "POST", cookie: hiker.cookie, body: { slotId, partySize: 2, requirements } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error, "INVALID_INPUT");
    }

    const { rows } = await pool.query("SELECT id FROM reservation WHERE slot_id = $1", [slotId]);
    assert.equal(rows.length, 0);
    assert.equal(inbox.length, emailsBefore);
  });

  // Verifies a booking without requirements has an empty list everywhere and is not flagged.
  it("shows a booking without requirements with an empty list and no allergy flag", async () => {
    const hiker = await createUserAndLogin("hiker", "Alan", "Turing");
    const slotId = await createSlot(hiker.id, "2094-07-22T12:00:00+02:00", "2094-07-22T13:00:00+02:00", { 1: 4 });

    const booking = await request("/reservations", { method: "POST", cookie: hiker.cookie, body: { slotId, partySize: 2 } });
    const list = await request(`/reservations?slotId=${slotId}`, { cookie: wardenCookie });

    assert.equal(booking.status, 201);
    assert.deepEqual(booking.body.requirements, []);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].hasAllergies, false);
    assert.deepEqual(list.body[0].requirements, []);
  });

  // Verifies the staff list is closed to visitors and hikers, and filters by status.
  it("lets only staff read the list and filters it by status", async () => {
    const hiker = await createUserAndLogin("hiker", "Katherine", "Johnson");
    const slotId = await createSlot(hiker.id, "2094-07-23T12:00:00+02:00", "2094-07-23T13:00:00+02:00", { 1: 4 });
    const booking = await request("/reservations", { method: "POST", cookie: hiker.cookie, body: { slotId, partySize: 2 } });
    assert.equal(booking.status, 201);

    assert.equal((await request(`/reservations?slotId=${slotId}`)).status, 401);
    assert.equal((await request(`/reservations?slotId=${slotId}`, { cookie: hiker.cookie })).status, 403);

    const confirmed = await request(`/reservations?slotId=${slotId}&status=confirmed`, { cookie: employeeCookie });
    const cancelled = await request(`/reservations?slotId=${slotId}&status=cancelled`, { cookie: employeeCookie });
    assert.deepEqual(confirmed.body.map((item) => item.id), [booking.body.id]);
    assert.deepEqual(cancelled.body, []);
  });
});
