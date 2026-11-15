import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import net from "node:net";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const TEST_EMAIL_PATTERN = "confirmation-e2e-%";
const PASSWORD = "password123";
const MAIL_FROM = "Mountain Hut <noreply@mountainhut.local>";
const TEST_VARIABLES = ["JWT_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"];
const originalEnv = Object.fromEntries(TEST_VARIABLES.map((name) => [name, process.env[name]]));
const server = app.listen(0, "127.0.0.1");
const smtpServer = net.createServer(receiveEmails);
const inbox = [];
let baseUrl;
let smtpPort;
let employeeId;

function receiveEmails(socket) {
  let buffer = "";
  let envelope = { from: null, to: [] };
  let dataLines = null;
  const reply = (line) => socket.write(`${line}\r\n`);

  socket.on("error", () => {});
  reply("220 localhost ESMTP");
  socket.on("data", (chunk) => {
    buffer += chunk.toString("latin1");
    let end;
    while ((end = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);

      if (dataLines) {
        if (line === ".") {
          inbox.push({ ...envelope, ...parseEmail(dataLines.join("\r\n")) });
          dataLines = null;
          reply("250 OK");
        } else {
          dataLines.push(line.startsWith(".") ? line.slice(1) : line);
        }
        continue;
      }

      const command = line.slice(0, 4).toUpperCase();
      if (command === "MAIL") envelope = { from: line.match(/<(.*)>/)[1], to: [] };
      if (command === "RCPT") envelope.to.push(line.match(/<(.*)>/)[1]);
      if (command === "DATA") {
        dataLines = [];
        reply("354 End data with <CR><LF>.<CR><LF>");
      } else if (command === "QUIT") {
        reply("221 Bye");
        socket.end();
      } else {
        reply("250 OK");
      }
    }
  });
}

function decodeQuotedPrintable(text) {
  const bytes = text.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

function decodeHeader(value) {
  return value.replace(/=\?utf-8\?Q\?(.*?)\?=/gi, (_, text) => decodeQuotedPrintable(text.replace(/_/g, " ")));
}

function decodeBody(headers, body) {
  if (/Content-Transfer-Encoding: quoted-printable/i.test(headers)) return decodeQuotedPrintable(body);
  if (/Content-Transfer-Encoding: base64/i.test(headers)) return Buffer.from(body, "base64").toString("utf8");
  return Buffer.from(body, "latin1").toString("utf8");
}

function parseEmail(raw) {
  const headers = raw.slice(0, raw.indexOf("\r\n\r\n")).replace(/\r\n[ \t]+/g, " ");
  const header = (name) => decodeHeader(headers.match(new RegExp(`^${name}: (.*)$`, "im"))[1]);
  const boundary = headers.match(/boundary="([^"]+)"/)[1];
  const parts = raw.split(`--${boundary}`).slice(1, -1).map((part) => {
    const separator = part.indexOf("\r\n\r\n");
    return { headers: part.slice(0, separator), body: decodeBody(part.slice(0, separator), part.slice(separator + 4)) };
  });
  const body = (type) => parts.find((part) => part.headers.includes(`Content-Type: ${type}`)).body;
  return { headers: { from: header("From"), to: header("To"), subject: header("Subject") }, html: body("text/html"), text: body("text/plain") };
}

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const emailsTo = (address) => inbox.filter((email) => email.to.includes(address));

async function listen(target, port = 0) {
  await new Promise((resolve, reject) => {
    target.once("error", reject);
    target.listen(port, "127.0.0.1", () => {
      target.off("error", reject);
      resolve();
    });
  });
  return target.address().port;
}

async function purgeTestData() {
  const testUsers = "SELECT id FROM app_user WHERE email LIKE $1";
  await pool.query(`DELETE FROM reservation WHERE hiker_id IN (${testUsers}) OR slot_id IN (SELECT id FROM slot WHERE created_by IN (${testUsers}))`, [TEST_EMAIL_PATTERN]);
  await pool.query(`DELETE FROM slot WHERE created_by IN (${testUsers})`, [TEST_EMAIL_PATTERN]);
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_PATTERN]);
}

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  smtpPort = await listen(smtpServer);
  Object.assign(process.env, { JWT_SECRET: "confirmation-e2e-test-secret", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM });

  await purgeTestData();
  employeeId = (await createUser("employee", "Marco", "Rossi")).id;
});

after(async () => {
  try {
    await purgeTestData();
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await new Promise((resolve) => smtpServer.close(resolve));
    await pool.end();

    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

async function createUser(role, firstName, lastName) {
  const email = `confirmation-e2e-${randomUUID()}@example.com`;
  const { salt, hash } = hashPassword(PASSWORD);
  const { rows: [user] } = await pool.query(
    "INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [email, hash, salt, firstName, lastName, role],
  );
  return { id: user.id, email };
}

async function createHiker(firstName, lastName) {
  const hiker = await createUser("hiker", firstName, lastName);
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: hiker.email, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const token = response.headers.get("set-cookie").match(/(?:^|,\s*)token=([^;]+)/)[1];
  return { ...hiker, cookie: `token=${token}` };
}

async function createSlot(startAt, endAt, seatsByTable) {
  const { rows: [slot] } = await pool.query("INSERT INTO slot (start_at, end_at, created_by) VALUES ($1, $2, $3) RETURNING id", [startAt, endAt, employeeId]);
  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    await pool.query("INSERT INTO slot_table (slot_id, table_number, seats) VALUES ($1, $2, $3)", [slot.id, tableNumber, seats]);
  }
  return { id: slot.id, startAt: new Date(startAt).toISOString() };
}

async function book(hiker, body) {
  const headers = { "content-type": "application/json" };
  if (hiker) headers.cookie = hiker.cookie;

  const response = await fetch(`${baseUrl}/reservations`, { method: "POST", headers, body: JSON.stringify(body) });
  assert.match(response.headers.get("content-type"), /^application\/json/);
  return { status: response.status, body: await response.json() };
}

async function findReservation(id) {
  const { rows } = await pool.query("SELECT status, party_size, confirmation_sent_at FROM reservation WHERE id = $1", [id]);
  return rows[0];
}

describe("confirmation end-to-end", () => {
  // Verifies a hiker who books a table receives one email with the reference, the date and time slot, the party size and their name, and no table numbers.
  it("emails the booking details to the hiker after a successful booking", async () => {
    const hiker = await createHiker("Ada", "Lovelace");
    const dinner = await createSlot("2095-12-15T19:00:00+01:00", "2095-12-15T21:00:00+01:00", { 1: 4, 2: 2 });

    const { status, body } = await book(hiker, { slotId: dinner.id, partySize: 5 });
    const emails = emailsTo(hiker.email);
    const html = visibleText(emails[0].html);
    const reference = `MH-${body.id}`;
    const { rows: [storedBooking] } = await pool.query(
      "SELECT created_at, updated_at FROM reservation WHERE id = $1",
      [body.id],
    );

    assert.equal(status, 201);
    assert.deepEqual(body, {
      id: body.id,
      slotId: dinner.id,
      startAt: dinner.startAt,
      partySize: 5,
      status: "confirmed",
      requirements: [],
      tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 1 }],
      createdAt: storedBooking.created_at.toISOString(),
      updatedAt: null,
      confirmationSent: true,
    });
    assert.equal(emails.length, 1);
    assert.deepEqual(emails[0].to, [hiker.email]);
    assert.equal(emails[0].headers.from, MAIL_FROM);
    assert.equal(emails[0].headers.to, hiker.email);
    assert.equal(emails[0].headers.subject, `Booking confirmed – ${reference}`);
    assert.match(html, /Hello, Ada Lovelace!/);
    assert.match(html, new RegExp(`Booking Reference ${reference} `));
    assert.match(html, /Date & Time 15 December 2095 - from 19:00 to 21:00 /);
    assert.match(html, /Party size 5 people /);
    assert.match(emails[0].text, /Hello, Ada Lovelace!/);
    assert.match(emails[0].text, new RegExp(`Booking Reference\\s+${reference}`));
    assert.match(emails[0].text, /Date & Time\s+15 December 2095 - from 19:00 to 21:00/);
    assert.match(emails[0].text, /Party size\s+5 people/);
    assert.doesNotMatch(html, /table/i);
    assert.doesNotMatch(emails[0].text, /table/i);
    assert.notEqual((await findReservation(body.id)).confirmation_sent_at, null);
  });

  // Verifies a summer slot is shown in the hut's summer time (UTC+2) in the email.
  it("shows a summer slot in the hut's summer time", async () => {
    const hiker = await createHiker("Ada", "Lovelace");
    const lunch = await createSlot("2095-07-20T12:00:00+02:00", "2095-07-20T13:30:00+02:00", { 1: 4 });

    const { status, body } = await book(hiker, { slotId: lunch.id, partySize: 1 });
    const [email] = emailsTo(hiker.email);

    assert.equal(status, 201);
    assert.equal(body.confirmationSent, true);
    assert.match(visibleText(email.html), /Date & Time 20 July 2095 - from 12:00 to 13:30 /);
    assert.match(visibleText(email.html), /Party size 1 person /);
    assert.match(email.text, /Date & Time\s+20 July 2095 - from 12:00 to 13:30/);
  });

  // Verifies each hiker who books the same slot gets only their own confirmation, with their own reference and name.
  it("sends each hiker the confirmation of their own booking", async () => {
    const ada = await createHiker("Ada", "Lovelace");
    const grace = await createHiker("Grace", "Hopper");
    const lunch = await createSlot("2095-12-16T12:00:00+01:00", "2095-12-16T13:00:00+01:00", { 1: 4, 2: 4 });

    const adaBooking = await book(ada, { slotId: lunch.id, partySize: 2 });
    const graceBooking = await book(grace, { slotId: lunch.id, partySize: 3 });
    const adaEmails = emailsTo(ada.email);
    const graceEmails = emailsTo(grace.email);

    assert.equal(adaEmails.length, 1);
    assert.equal(graceEmails.length, 1);
    assert.equal(adaEmails[0].headers.subject, `Booking confirmed – MH-${adaBooking.body.id}`);
    assert.equal(graceEmails[0].headers.subject, `Booking confirmed – MH-${graceBooking.body.id}`);
    assert.match(visibleText(adaEmails[0].html), /Hello, Ada Lovelace!.*Party size 2 people /);
    assert.match(visibleText(graceEmails[0].html), /Hello, Grace Hopper!.*Party size 3 people /);
  });

  // Verifies the booking stays valid with confirmationSent false while the SMTP server is down, the failure is logged, and emails work again once it is back.
  it("keeps the booking and answers confirmationSent false when the SMTP server is down", async (t) => {
    const hiker = await createHiker("Ada", "Lovelace");
    const other = await createHiker("Grace", "Hopper");
    const lunch = await createSlot("2095-12-17T12:00:00+01:00", "2095-12-17T13:00:00+01:00", { 1: 4, 2: 2 });
    const dinner = await createSlot("2095-12-17T19:00:00+01:00", "2095-12-17T21:00:00+01:00", { 1: 4 });
    const consoleErrorMock = t.mock.method(console, "error", () => {});
    await new Promise((resolve) => smtpServer.close(resolve));

    let whileDown;
    try {
      whileDown = await book(hiker, { slotId: lunch.id, partySize: 6 });
    } finally {
      await listen(smtpServer, smtpPort);
    }
    const { rows: seats } = await pool.query("SELECT seats FROM reservation_seat WHERE reservation_id = $1 ORDER BY seats DESC", [whileDown.body.id]);
    const afterRestart = await book(other, { slotId: dinner.id, partySize: 2 });

    assert.equal(whileDown.status, 201);
    assert.equal(whileDown.body.status, "confirmed");
    assert.equal(whileDown.body.confirmationSent, false);
    assert.deepEqual(await findReservation(whileDown.body.id), { status: "confirmed", party_size: 6, confirmation_sent_at: null });
    assert.deepEqual(seats, [{ seats: 4 }, { seats: 2 }]);
    assert.equal(emailsTo(hiker.email).length, 0);
    assert.ok(consoleErrorMock.mock.calls.some((call) => call.arguments[0] === `Confirmation email for reservation ${whileDown.body.id} not sent:`));
    assert.equal(afterRestart.status, 201);
    assert.equal(afterRestart.body.confirmationSent, true);
    assert.equal(emailsTo(other.email).length, 1);
  });

  // Verifies a refused booking (full slot, past slot, second booking in the slot, not logged in) sends no email.
  it("sends no email when the booking is refused", async (t) => {
    const hiker = await createHiker("Ada", "Lovelace");
    const lunch = await createSlot("2095-12-19T12:00:00+01:00", "2095-12-19T13:00:00+01:00", { 1: 4 });
    const pastLunch = await createSlot("2003-12-19T12:00:00+01:00", "2003-12-19T13:00:00+01:00", { 1: 4 });
    t.mock.method(console, "error", () => {});

    const tooMany = await book(hiker, { slotId: lunch.id, partySize: 5 });
    const past = await book(hiker, { slotId: pastLunch.id, partySize: 2 });
    const notLoggedIn = await book(null, { slotId: lunch.id, partySize: 2 });
    assert.equal(emailsTo(hiker.email).length, 0);

    const first = await book(hiker, { slotId: lunch.id, partySize: 2 });
    const second = await book(hiker, { slotId: lunch.id, partySize: 1 });

    assert.deepEqual([tooMany.status, tooMany.body.error], [409, "NOT_ENOUGH_SEATS"]);
    assert.deepEqual([past.status, past.body.error], [422, "BOOKING_CLOSED"]);
    assert.deepEqual([notLoggedIn.status, notLoggedIn.body.error], [401, "NOT_AUTHENTICATED"]);
    assert.equal(first.status, 201);
    assert.deepEqual([second.status, second.body.error], [409, "ALREADY_BOOKED"]);
    assert.equal(emailsTo(hiker.email).length, 1);
    assert.equal(emailsTo(hiker.email)[0].headers.subject, `Booking confirmed – MH-${first.body.id}`);
  });
});
