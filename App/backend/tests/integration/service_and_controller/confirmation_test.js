import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import pool from "../../../src/database/connection.js";
import authRepository from "../../../src/database/auth.repository.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import slotRepository from "../../../src/database/slot.repository.js";
import emailSender from "../../../src/emails/emailSender.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "confirmation-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

const SLOT_START = new Date("2099-12-15T12:00:00+01:00");
const BOOKING_CREATED_AT = new Date("2099-09-01T10:00:00.000Z");

const confirmationData = () => ({
  id: 31,
  partySize: 6,
  email: "ada.lovelace@example.com",
  hikerName: "Ada Lovelace",
  startAt: SLOT_START,
  endAt: new Date("2099-12-15T14:00:00+01:00"),
});

const bookingBody = (confirmationSent) => ({
  id: 31,
  slotId: 7,
  startAt: SLOT_START.toISOString(),
  partySize: 6,
  status: "confirmed",
  tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }],
  requirements: [],
  createdAt: BOOKING_CREATED_AT.toISOString(),
  updatedAt: null,
  confirmationSent,
});

function mockRepositories() {
  mock.method(authRepository, "findUserById", async (id) => ({
    id, role: id === 13 ? "employee" : "hiker", mustChangePassword: false,
  }));
  //What the insert saved, returned by the read that follows it (like the real database)
  let savedRequirements = [];
  const client = {
    query: mock.fn(async (sql) => (
      sql.includes("SELECT created_at, updated_at FROM reservation")
        ? { rows: [{ created_at: BOOKING_CREATED_AT, updated_at: null }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    )),
    release: mock.fn(),
  };
  return {
    client,
    connectMock: mock.method(pool, "connect", async () => client),
    lockSlotMock: mock.method(slotRepository, "lockSlotById", async () => ({ id: 7, start_at: SLOT_START, bookable: true })),
    hasReservationMock: mock.method(reservationRepository, "hasConfirmedReservation", async () => false),
    freeTablesMock: mock.method(slotRepository, "findFreeTablesBySlotId", async () => [
      { slotTableId: 71, tableNumber: 1, freeSeats: 4 },
      { slotTableId: 72, tableNumber: 2, freeSeats: 2 },
    ]),
    insertReservationMock: mock.method(reservationRepository, "insertReservation", async () => 31),
    insertSeatsMock: mock.method(reservationRepository, "insertReservationSeats", async () => {}),
    //Gives each saved requirement an id, like the RETURNING id of the real insert
    insertRequirementsMock: mock.method(reservationRepository, "insertReservationRequirements", async (client, reservationId, requirements) => {
      savedRequirements = requirements.map((requirement, index) => ({ id: 100 + index, ...requirement }));
      return savedRequirements;
    }),
    getRequirementsMock: mock.method(reservationRepository, "getReservationRequirements", async () => savedRequirements),
    requirementsMock: mock.method(reservationRepository, "getRequirementsByReservationId", async () => []),
    getConfirmationDataMock: mock.method(reservationRepository, "getConfirmationData", async () => confirmationData()),
    markConfirmationSentMock: mock.method(reservationRepository, "markConfirmationSent", async () => {}),
    sendMock: mock.method(emailSender, "send", async () => {}),
    consoleErrorMock: mock.method(console, "error", () => {}),
  };
}

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/reservations`;
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

function loginCookie({ id = 12, role = "hiker" } = {}) {
  const token = jwt.sign({ id, email: "ada.lovelace@example.com", firstName: "Ada", lastName: "Lovelace", role }, testJwtSecret, { expiresIn: "1d" });
  return `token=${token}`;
}

async function book(body, { cookie = loginCookie() } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;

  return fetch(baseUrl, { method: "POST", headers, body: JSON.stringify(body) });
}

async function assertJsonResponse(response, status, body) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await response.json(), body);
}

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("confirmation controller and service integration", () => {
  // Verifies a successful booking answers 201 with confirmationSent true after emailing the logged-in hiker and saving confirmation_sent_at.
  it("returns 201 with confirmationSent true and emails the hiker who booked", async () => {
    const { hasReservationMock, getConfirmationDataMock, markConfirmationSentMock, sendMock } = mockRepositories();

    const response = await book({ slotId: 7, partySize: 6 });
    const message = sendMock.mock.calls[0].arguments[0];

    await assertJsonResponse(response, 201, bookingBody(true));
    assert.equal(hasReservationMock.mock.calls[0].arguments[1], 12);
    assert.deepEqual(getConfirmationDataMock.mock.calls[0].arguments, [31]);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(message.to, "ada.lovelace@example.com");
    assert.equal(message.subject, "Booking confirmed – MH-31");
    assert.match(visibleText(message.html), /Booking Reference MH-31 /);
    assert.match(visibleText(message.html), /Date & Time 15 December 2099 - from 12:00 to 14:00 /);
    assert.match(visibleText(message.html), /Party size 6 people /);
    assert.match(message.text, /Hello, Ada Lovelace!/);
    assert.deepEqual(markConfirmationSentMock.mock.calls[0].arguments, [31]);
  });

  // Verifies an email the SMTP server does not accept still answers 201 with the booking and confirmationSent false, without saving confirmation_sent_at.
  it("returns 201 with confirmationSent false when the email cannot be sent", async () => {
    const { client, markConfirmationSentMock, sendMock } = mockRepositories();
    sendMock.mock.mockImplementation(async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1025"); });

    const response = await book({ slotId: 7, partySize: 6 });

    await assertJsonResponse(response, 201, bookingBody(false));
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(markConfirmationSentMock.mock.callCount(), 0);
    assert.ok(client.query.mock.calls.some((call) => call.arguments[0] === "COMMIT"));
    assert.equal(client.query.mock.calls.some((call) => call.arguments[0] === "ROLLBACK"), false);
  });

  // Verifies the booking still answers 201 with confirmationSent false when its data for the email cannot be read after the commit.
  it("returns 201 with confirmationSent false when the email data cannot be read", async () => {
    const { getConfirmationDataMock, sendMock } = mockRepositories();
    getConfirmationDataMock.mock.mockImplementation(async () => { throw new Error("connection terminated"); });

    const response = await book({ slotId: 7, partySize: 6 });

    await assertJsonResponse(response, 201, bookingBody(false));
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Verifies an email that was sent answers confirmationSent true even if saving confirmation_sent_at fails afterwards.
  it("returns 201 with confirmationSent true when only saving confirmation_sent_at fails", async () => {
    const { markConfirmationSentMock, sendMock } = mockRepositories();
    markConfirmationSentMock.mock.mockImplementation(async () => { throw new Error("connection terminated"); });

    const response = await book({ slotId: 7, partySize: 6 });

    await assertJsonResponse(response, 201, bookingBody(true));
    assert.equal(sendMock.mock.callCount(), 1);
  });

  // Verifies the requirements are validated, trimmed, saved in the booking transaction and listed in the email (MH-05).
  it("saves the party requirements and lists them in the confirmation email", async () => {
    const { insertRequirementsMock, requirementsMock, sendMock, client } = mockRepositories();
    const requirements = [
      { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
      { peopleCount: 1, hasAllergies: true, description: " Vegan, peanut allergy " },
    ];
    //The email reads the saved requirements in the order they were saved; it lists allergies first itself
    requirementsMock.mock.mockImplementation(async () => [
      { id: 100, peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
      { id: 101, peopleCount: 1, hasAllergies: true, description: "Vegan, peanut allergy" },
    ]);

    const response = await book({ slotId: 7, partySize: 6, requirements });
    const body = await response.json();
    const text = sendMock.mock.calls[0].arguments[0].text;

    assert.equal(response.status, 201);
    assert.deepEqual(body.requirements, [
      { id: 100, peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
      { id: 101, peopleCount: 1, hasAllergies: true, description: "Vegan, peanut allergy" },
    ]);
    const [usedClient, reservationId, saved] = insertRequirementsMock.mock.calls[0].arguments;
    assert.equal(usedClient, client);
    assert.equal(reservationId, 31);
    assert.equal(saved[1].description, "Vegan, peanut allergy");
    assert.ok(text.includes("1 × ALLERGY: Vegan, peanut allergy"));
    assert.ok(text.indexOf("1 × ALLERGY: Vegan, peanut allergy") < text.indexOf("2 × Vegetarians"));
  });

  // Verifies invalid requirements are refused with 400 before any database work.
  it("refuses invalid requirements with 400 INVALID_INPUT and books nothing", async () => {
    const { connectMock, insertRequirementsMock, sendMock } = mockRepositories();

    const response = await book({ slotId: 7, partySize: 2, requirements: [{ peopleCount: 3, hasAllergies: false, description: "Vegetarians" }] });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "INVALID_INPUT");
    assert.equal(connectMock.mock.callCount(), 0);
    assert.equal(insertRequirementsMock.mock.callCount(), 0);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Verifies every refused booking answers with its documented error and sends no confirmation email.
  it("sends no email when the booking is refused", async () => {
    const mocks = mockRepositories();
    const refusals = [
      { request: () => book({ slotId: 7, partySize: 6 }, { cookie: null }), status: 401, error: "NOT_AUTHENTICATED" },
      { request: () => book({ slotId: 7, partySize: 6 }, { cookie: loginCookie({ id: 13, role: "employee" }) }), status: 403, error: "FORBIDDEN_ROLE" },
      { request: () => book({ slotId: 7, partySize: 0 }), status: 400, error: "INVALID_INPUT" },
      { setUp: () => mocks.lockSlotMock.mock.mockImplementationOnce(async () => undefined), status: 404, error: "SLOT_NOT_FOUND" },
      { setUp: () => mocks.lockSlotMock.mock.mockImplementationOnce(async () => ({ id: 7, start_at: SLOT_START, bookable: false })), status: 422, error: "BOOKING_CLOSED" },
      { setUp: () => mocks.hasReservationMock.mock.mockImplementationOnce(async () => true), status: 409, error: "ALREADY_BOOKED" },
      { request: () => book({ slotId: 7, partySize: 7 }), status: 409, error: "NOT_ENOUGH_SEATS" },
    ];

    for (const { setUp, request = () => book({ slotId: 7, partySize: 6 }), status, error } of refusals) {
      setUp?.();

      const response = await request();

      assert.equal(response.status, status, error);
      assert.equal((await response.json()).error, error);
    }

    assert.equal(mocks.getConfirmationDataMock.mock.callCount(), 0);
    assert.equal(mocks.sendMock.mock.callCount(), 0);
    assert.equal(mocks.markConfirmationSentMock.mock.callCount(), 0);
  });
});
