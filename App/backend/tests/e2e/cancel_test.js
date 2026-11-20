import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import net from "node:net";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";
import { hashPassword } from "../../src/utils/cryptoUtils.js";

const TEST_EMAIL_PATTERN = "cancel-e2e-%";
const TEMPORARY_LAST_NAME = "CancelE2ETemporary";
const PASSWORD = "password123";
const MAIL_FROM = "Mountain Hut <noreply@mountainhut.local>";
const TEST_VARIABLES = ["JWT_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"];
const originalEnv = Object.fromEntries(TEST_VARIABLES.map((name) => [name, process.env[name]]));
const HOUR = 60 * 60 * 1000;
const server = app.listen(0, "127.0.0.1");
const smtpServer = net.createServer(receiveEmails);
const inbox = [];
let baseUrl;
let smtpPort;
let giulia;
let marco;

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

const cancellationEmailsTo = (address) =>
  inbox.filter((email) => email.to.includes(address) && email.headers.subject.startsWith("Booking cancelled"));

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
  const testUsers = "SELECT id FROM app_user WHERE email LIKE $1 OR last_name = $2";
  const params = [TEST_EMAIL_PATTERN, TEMPORARY_LAST_NAME];
  await pool.query(`DELETE FROM reservation WHERE hiker_id IN (${testUsers}) OR slot_id IN (SELECT id FROM slot WHERE created_by IN (${testUsers}))`, params);
  await pool.query(`DELETE FROM slot WHERE created_by IN (${testUsers})`, params);
  await pool.query("DELETE FROM app_user WHERE email LIKE $1 OR last_name = $2", params);
}

async function createUser(role, firstName, lastName) {
  const email = `cancel-e2e-${randomUUID()}@example.com`;
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
  return { id: user.id, email, firstName, lastName, role, cookie: `token=${token}` };
}

async function createTemporaryHiker() {
  const { rows: [user] } = await pool.query(
    "INSERT INTO app_user (first_name, last_name, phone, is_temporary, role) VALUES ('Luca', $1, '3471112233', true, 'hiker') RETURNING id",
    [TEMPORARY_LAST_NAME],
  );
  return { id: user.id };
}

async function createSlot(startAt, endAt, seatsByTable = { 1: 4, 2: 2 }) {
  const { rows: [slot] } = await pool.query("INSERT INTO slot (start_at, end_at, created_by) VALUES ($1, $2, $3) RETURNING id", [startAt, endAt, giulia.id]);
  for (const [tableNumber, seats] of Object.entries(seatsByTable)) {
    await pool.query("INSERT INTO slot_table (slot_id, table_number, seats) VALUES ($1, $2, $3)", [slot.id, tableNumber, seats]);
  }
  return { id: slot.id, startAt: new Date(startAt).toISOString() };
}

async function insertBooking(hikerId, slotId, partySize) {
  const { rows: [reservation] } = await pool.query(
    "INSERT INTO reservation (hiker_id, slot_id, party_size) VALUES ($1, $2, $3) RETURNING id",
    [hikerId, slotId, partySize],
  );
  const { rows: [table] } = await pool.query("SELECT id FROM slot_table WHERE slot_id = $1 ORDER BY table_number LIMIT 1", [slotId]);
  await pool.query(
    "INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats) VALUES ($1, $2, $3, $4)",
    [reservation.id, table.id, slotId, partySize],
  );
  return reservation.id;
}

async function request(method, path, user, body) {
  const headers = {};
  if (user) headers.cookie = user.cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.match(response.headers.get("content-type"), /^application\/json/);
  return { status: response.status, body: await response.json() };
}

const book = (hiker, body) => request("POST", "/reservations", hiker, body);
const cancelOwn = (hiker, id) => request("POST", `/reservations/${id}/cancel`, hiker);
const cancelAsStaff = (staff, id) => request("POST", `/staff/reservations/${id}/cancel`, staff);
const myBooking = async (hiker, id) => (await request("GET", "/me/reservations", hiker)).body.find((item) => item.id === id);
const staffBooking = async (staff, date, id) =>
  (await request("GET", `/reservations?date=${date}&status=cancelled`, staff)).body.find((item) => item.id === id);
const freeSeats = async (date, time) =>
  (await request("GET", `/availability?date=${date}&time=${time}&partySize=1`)).body.freeSeats;

async function storedBooking(id) {
  const { rows: [row] } = await pool.query("SELECT status, cancelled_at, cancelled_by FROM reservation WHERE id = $1", [id]);
  return row;
}

const cancellerOf = (user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  smtpPort = await listen(smtpServer);
  Object.assign(process.env, { JWT_SECRET: "cancel-e2e-test-secret", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM });

  await purgeTestData();
  giulia = await createUser("employee", "Giulia", "Bianchi");
  marco = await createUser("warden", "Marco", "Rossi");
});

beforeEach(() => {
  mock.method(console, "error", () => {});
});

afterEach(() => {
  mock.reset();
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

describe("cancel a booking end-to-end (MH-08)", () => {
  // Verifies a hiker who cancels their booking gets 200 with the cancelled booking, the seats are free again and the hiker's list shows it as cancelled.
  it("cancels the hiker's booking, frees its seats and shows it as cancelled in their list", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-10T12:00:00+01:00", "2092-03-10T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 3 });
    const listedBefore = await myBooking(ada, booked.body.id);
    const freeBefore = await freeSeats("2092-03-10", "12:30");

    const response = await cancelOwn(ada, booked.body.id);
    const stored = await storedBooking(booked.body.id);
    const listedAfter = await myBooking(ada, booked.body.id);

    assert.equal(booked.status, 201);
    assert.equal(listedBefore.cancellable, true);
    assert.equal(freeBefore, 3);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      id: booked.body.id,
      slotId: lunch.id,
      startAt: lunch.startAt,
      partySize: 3,
      status: "cancelled",
      cancelledAt: stored.cancelled_at.toISOString(),
      cancelledBy: cancellerOf(ada),
      confirmationSent: true,
    });
    assert.equal(stored.status, "cancelled");
    assert.equal(stored.cancelled_by, ada.id);
    assert.equal(await freeSeats("2092-03-10", "12:30"), 6);
    assert.equal(listedAfter.status, "cancelled");
    assert.equal(listedAfter.cancellable, false);
    assert.equal(listedAfter.changeable, false);
    assert.equal(listedAfter.cancelledAt, response.body.cancelledAt);
  });

  // Verifies the hiker receives one "booking cancelled" email with the reference, the slot in the hut's time, the party size, the requirements and their name.
  it("emails the hiker that the booking is cancelled", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const dinner = await createSlot("2092-07-20T19:00:00+02:00", "2092-07-20T21:00:00+02:00");
    const booked = await book(ada, {
      slotId: dinner.id,
      partySize: 3,
      requirements: [{ peopleCount: 1, hasAllergies: true, description: "Peanut allergy" }],
    });

    await cancelOwn(ada, booked.body.id);
    const emails = cancellationEmailsTo(ada.email);
    const html = visibleText(emails[0].html);
    const reference = `MH-${booked.body.id}`;

    assert.equal(emails.length, 1);
    assert.deepEqual(emails[0].to, [ada.email]);
    assert.equal(emails[0].headers.from, MAIL_FROM);
    assert.equal(emails[0].headers.subject, `Booking cancelled – ${reference}`);
    assert.match(html, /Your reservation has been cancelled/);
    assert.match(html, /Hello, Ada Lovelace!/);
    assert.match(html, new RegExp(`Booking Reference ${reference} `));
    assert.match(html, /Date & Time 20 July 2092 - from 19:00 to 21:00 /);
    assert.match(html, /Party size 3 people /);
    assert.match(html, /1 × ALLERGY: Peanut allergy/);
    assert.match(emails[0].text, /Your reservation has been cancelled/);
    assert.doesNotMatch(html, /table/i);
  });

  // Verifies nothing is deleted: the seat and requirement rows of the cancelled booking are kept as history.
  it("keeps the seats and requirements of the cancelled booking as history", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-11T12:00:00+01:00", "2092-03-11T14:00:00+01:00");
    const booked = await book(ada, {
      slotId: lunch.id,
      partySize: 5,
      requirements: [{ peopleCount: 2, hasAllergies: false, description: "Vegetarians" }],
    });

    await cancelOwn(ada, booked.body.id);
    const { rows: seats } = await pool.query("SELECT seats FROM reservation_seat WHERE reservation_id = $1 ORDER BY seats DESC", [booked.body.id]);
    const { rows: requirements } = await pool.query("SELECT id FROM reservation_requirement WHERE reservation_id = $1", [booked.body.id]);

    assert.deepEqual(seats.map((seat) => seat.seats), booked.body.tables.map((table) => table.seats).sort((a, b) => b - a));
    assert.deepEqual(requirements.map((requirement) => requirement.id), booked.body.requirements.map((requirement) => requirement.id));
  });

  // Verifies the hiker can book the same slot again after cancelling, and another guest can take the freed seats.
  it("lets the hiker book the same slot again and other guests take the freed seats", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const grace = await createUser("hiker", "Grace", "Hopper");
    const lunch = await createSlot("2092-03-12T12:00:00+01:00", "2092-03-12T14:00:00+01:00", { 1: 4 });
    const first = await book(ada, { slotId: lunch.id, partySize: 4 });
    const fullForGrace = await book(grace, { slotId: lunch.id, partySize: 2 });

    await cancelOwn(ada, first.body.id);
    const graceBooking = await book(grace, { slotId: lunch.id, partySize: 2 });
    const adaAgain = await book(ada, { slotId: lunch.id, partySize: 2 });

    assert.deepEqual([fullForGrace.status, fullForGrace.body.error], [409, "NOT_ENOUGH_SEATS"]);
    assert.equal(graceBooking.status, 201);
    assert.equal(adaAgain.status, 201);
    assert.notEqual(adaAgain.body.id, first.body.id);
  });

  // Verifies a cancelled booking cannot be cancelled again or changed, and no further email is sent.
  it("refuses to cancel again or change a cancelled booking", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-13T12:00:00+01:00", "2092-03-13T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 2 });
    await cancelOwn(ada, booked.body.id);
    const first = await storedBooking(booked.body.id);

    const again = await cancelOwn(ada, booked.body.id);
    const byStaff = await cancelAsStaff(giulia, booked.body.id);
    const change = await request("PATCH", `/reservations/${booked.body.id}`, ada, { partySize: 3 });

    assert.deepEqual([again.status, again.body.error], [409, "RESERVATION_CANCELLED"]);
    assert.deepEqual([byStaff.status, byStaff.body.error], [409, "RESERVATION_CANCELLED"]);
    assert.deepEqual([change.status, change.body.error], [409, "RESERVATION_CANCELLED"]);
    assert.deepEqual(await storedBooking(booked.body.id), first);
    assert.equal(cancellationEmailsTo(ada.email).length, 1);
  });

  // Verifies a hiker cannot cancel another hiker's booking: it is answered as not found and stays confirmed.
  it("answers 404 RESERVATION_NOT_FOUND for another hiker's booking or a missing one", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const grace = await createUser("hiker", "Grace", "Hopper");
    const lunch = await createSlot("2092-03-14T12:00:00+01:00", "2092-03-14T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 2 });

    const others = await cancelOwn(grace, booked.body.id);
    const missing = await cancelOwn(grace, 2147483647);

    assert.deepEqual([others.status, others.body.error], [404, "RESERVATION_NOT_FOUND"]);
    assert.deepEqual([missing.status, missing.body.error], [404, "RESERVATION_NOT_FOUND"]);
    assert.equal((await storedBooking(booked.body.id)).status, "confirmed");
    assert.equal(cancellationEmailsTo(ada.email).length, 0);
    assert.equal(cancellationEmailsTo(grace.email).length, 0);
  });

  // Verifies a booking can be cancelled while its slot is in progress, and is shown as cancellable until then.
  it("cancels a booking while its slot is in progress", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const now = Date.now();
    const slot = await createSlot(new Date(now - 10 * 60 * 1000), new Date(now + 50 * 60 * 1000));
    const bookingId = await insertBooking(ada.id, slot.id, 2);
    const listed = await myBooking(ada, bookingId);

    const response = await cancelOwn(ada, bookingId);

    assert.equal(listed.cancellable, true);
    assert.equal(listed.changeable, false);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
    assert.equal((await storedBooking(bookingId)).status, "cancelled");
  });

  // Verifies a booking whose slot has ended cannot be cancelled by the hiker or by staff (422 SLOT_ENDED).
  it("answers 422 SLOT_ENDED when the slot has ended", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const now = Date.now();
    const slot = await createSlot(new Date(now - 3 * HOUR), new Date(now - 2 * HOUR));
    const bookingId = await insertBooking(ada.id, slot.id, 2);

    const byHiker = await cancelOwn(ada, bookingId);
    const byStaff = await cancelAsStaff(marco, bookingId);

    assert.deepEqual([byHiker.status, byHiker.body.error], [422, "SLOT_ENDED"]);
    assert.deepEqual([byStaff.status, byStaff.body.error], [422, "SLOT_ENDED"]);
    assert.equal((await storedBooking(bookingId)).status, "confirmed");
    assert.equal(cancellationEmailsTo(ada.email).length, 0);
  });

  // Verifies an employee can cancel a hiker's booking: the employee is recorded, the hiker is emailed, and the staff list shows when and by whom.
  it("lets an employee cancel a hiker's booking and shows it in the staff list", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-15T12:00:00+01:00", "2092-03-15T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 2 });

    const response = await cancelAsStaff(giulia, booked.body.id);
    const listed = await staffBooking(giulia, "2092-03-15", booked.body.id);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
    assert.deepEqual(response.body.cancelledBy, cancellerOf(giulia));
    assert.equal(response.body.confirmationSent, true);
    assert.equal(cancellationEmailsTo(ada.email).length, 1);
    assert.equal(cancellationEmailsTo(giulia.email).length, 0);
    assert.equal(listed.status, "cancelled");
    assert.equal(listed.cancelledAt, response.body.cancelledAt);
    assert.deepEqual(listed.cancelledBy, cancellerOf(giulia));
    assert.deepEqual(listed.tables, booked.body.tables);
  });

  // Verifies the warden can cancel a hiker's booking and is recorded as the canceller.
  it("lets the warden cancel a hiker's booking", async () => {
    const grace = await createUser("hiker", "Grace", "Hopper");
    const lunch = await createSlot("2092-03-16T12:00:00+01:00", "2092-03-16T14:00:00+01:00");
    const booked = await book(grace, { slotId: lunch.id, partySize: 2 });

    const response = await cancelAsStaff(marco, booked.body.id);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.cancelledBy, cancellerOf(marco));
    assert.equal((await storedBooking(booked.body.id)).cancelled_by, marco.id);
  });

  // Verifies staff can cancel a temporary hiker's booking, which sends no email because the hiker has none.
  it("lets staff cancel a temporary hiker's booking without an email", async () => {
    const luca = await createTemporaryHiker();
    const lunch = await createSlot("2092-03-17T12:00:00+01:00", "2092-03-17T14:00:00+01:00");
    const bookingId = await insertBooking(luca.id, lunch.id, 3);
    const emailsBefore = inbox.length;

    const response = await cancelAsStaff(giulia, bookingId);
    const listed = await staffBooking(giulia, "2092-03-17", bookingId);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
    assert.equal(response.body.confirmationSent, false);
    assert.equal(inbox.length, emailsBefore);
    assert.equal(listed.hiker.isTemporary, true);
    assert.deepEqual(listed.cancelledBy, cancellerOf(giulia));
  });

  // Verifies only logged-in users with the right role can use each endpoint, and bad ids are refused.
  it("checks the login, the role and the id before cancelling", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-18T12:00:00+01:00", "2092-03-18T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 2 });

    const anonymousHiker = await cancelOwn(null, booked.body.id);
    const anonymousStaff = await cancelAsStaff(null, booked.body.id);
    const staffOnHikerEndpoint = await cancelOwn(giulia, booked.body.id);
    const hikerOnStaffEndpoint = await cancelAsStaff(ada, booked.body.id);
    const badId = await cancelOwn(ada, "abc");
    const zeroId = await cancelAsStaff(giulia, 0);

    assert.deepEqual([anonymousHiker.status, anonymousHiker.body.error], [401, "NOT_AUTHENTICATED"]);
    assert.deepEqual([anonymousStaff.status, anonymousStaff.body.error], [401, "NOT_AUTHENTICATED"]);
    assert.deepEqual([staffOnHikerEndpoint.status, staffOnHikerEndpoint.body.error], [403, "FORBIDDEN_ROLE"]);
    assert.deepEqual([hikerOnStaffEndpoint.status, hikerOnStaffEndpoint.body.error], [403, "FORBIDDEN_ROLE"]);
    assert.deepEqual([badId.status, badId.body.error], [400, "INVALID_INPUT"]);
    assert.deepEqual([zeroId.status, zeroId.body.error], [400, "INVALID_INPUT"]);
    assert.equal((await storedBooking(booked.body.id)).status, "confirmed");
  });

  // Verifies the cancellation stays valid with confirmationSent false while the SMTP server is down, and the failure is logged.
  it("keeps the cancellation and answers confirmationSent false when the SMTP server is down", async (t) => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-19T12:00:00+01:00", "2092-03-19T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 2 });
    const consoleErrorMock = t.mock.method(console, "error", () => {});
    await new Promise((resolve) => smtpServer.close(resolve));

    let response;
    try {
      response = await cancelOwn(ada, booked.body.id);
    } finally {
      await listen(smtpServer, smtpPort);
    }

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "cancelled");
    assert.equal(response.body.confirmationSent, false);
    assert.equal((await storedBooking(booked.body.id)).status, "cancelled");
    assert.equal(cancellationEmailsTo(ada.email).length, 0);
    assert.ok(consoleErrorMock.mock.calls.some((call) => call.arguments[0] === `Cancellation email for reservation ${booked.body.id} not sent:`));
  });

  // Verifies two cancellations of the same booking at the same time give one 200 and one 409, and one email.
  it("accepts only one of two simultaneous cancellations", async () => {
    const ada = await createUser("hiker", "Ada", "Lovelace");
    const lunch = await createSlot("2092-03-20T12:00:00+01:00", "2092-03-20T14:00:00+01:00");
    const booked = await book(ada, { slotId: lunch.id, partySize: 2 });

    const [byHiker, byStaff] = await Promise.all([cancelOwn(ada, booked.body.id), cancelAsStaff(giulia, booked.body.id)]);
    const winner = byHiker.status === 200 ? byHiker : byStaff;
    const loser = byHiker.status === 200 ? byStaff : byHiker;

    assert.equal(winner.status, 200);
    assert.deepEqual([loser.status, loser.body.error], [409, "RESERVATION_CANCELLED"]);
    assert.equal((await storedBooking(booked.body.id)).cancelled_by, winner.body.cancelledBy.id);
    assert.equal(cancellationEmailsTo(ada.email).length, 1);
  });
});
