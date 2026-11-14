import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import { ConflictError, ErrorClass, NotFoundError } from "../../../src/errors/ErrorClass.js";
import reservationService from "../../../src/services/reservation.service.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "reservation-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

const reservations = [
  {
    id: 31,
    slot: {
      id: 7,
      startAt: "2099-12-15T11:00:00.000Z",
      endAt: "2099-12-15T13:00:00.000Z",
    },
    partySize: 4,
    status: "confirmed",
    createdAt: "2099-09-01T10:00:00.000Z",
    updatedAt: "2099-10-01T10:00:00.000Z",
    cancelledAt: null,
    changeable: true,
    cancellable: true,
    requirements: [],
  },
];

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

afterEach(() => {
  mock.reset();
});

beforeEach(() => {
  mock.method(console, "error", () => {});
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

function loginCookie({ id = 12, role = "hiker" } = {}) {
  const token = jwt.sign(
    { id, email: "ada.lovelace@example.com", role },
    testJwtSecret,
    { expiresIn: "1d" },
  );
  return `token=${token}`;
}

async function request(path, { method = "GET", body, cookie = loginCookie() } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("MH-06 reservation endpoints", () => {
  it("returns the current hiker's reservations and passes the hiker id to the service", async () => {
    const getReservationsMock = mock.method(
      reservationService,
      "getMyReservations",
      async () => reservations,
    );

    const response = await request("/me/reservations");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), reservations);
    assert.deepEqual(getReservationsMock.mock.calls[0].arguments, [12]);
  });

  it("requires an authenticated hiker for both reservation endpoints", async () => {
    const getReservationsMock = mock.method(
      reservationService,
      "getMyReservations",
      async () => reservations,
    );
    const changeBookingMock = mock.method(
      reservationService,
      "changeBooking",
      async () => reservations[0],
    );

    const refusals = [
      { path: "/me/reservations", options: { cookie: null }, status: 401, error: "NOT_AUTHENTICATED" },
      { path: "/me/reservations", options: { cookie: loginCookie({ role: "employee" }) }, status: 403, error: "FORBIDDEN_ROLE" },
      { path: "/reservations/31", options: { method: "PATCH", body: { partySize: 5 }, cookie: null }, status: 401, error: "NOT_AUTHENTICATED" },
      { path: "/reservations/31", options: { method: "PATCH", body: { partySize: 5 }, cookie: loginCookie({ role: "employee" }) }, status: 403, error: "FORBIDDEN_ROLE" },
    ];

    for (const { path, options, status, error } of refusals) {
      const response = await request(path, options);
      assert.equal(response.status, status);
      assert.equal((await response.json()).error, error);
    }

    assert.equal(getReservationsMock.mock.callCount(), 0);
    assert.equal(changeBookingMock.mock.callCount(), 0);
  });

  it("changes a booking and returns the service result", async () => {
    const changeBookingMock = mock.method(
      reservationService,
      "changeBooking",
      async () => ({
        ...reservations[0],
        partySize: 5,
        confirmationSent: true,
      }),
    );
    const body = {
      partySize: 5,
      requirements: [{ peopleCount: 2, hasAllergies: false, description: "Vegetarian" }],
    };

    const response = await request("/reservations/31", {
      method: "PATCH",
      body,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ...reservations[0],
      partySize: 5,
      confirmationSent: true,
    });
    assert.deepEqual(changeBookingMock.mock.calls[0].arguments, [
      12,
      31,
      { slotId: undefined, partySize: 5, requirements: body.requirements },
    ]);
  });

  it("maps booking ownership, timing, and availability errors to API responses", async () => {
    const changeBookingMock = mock.method(
      reservationService,
      "changeBooking",
      async () => {},
    );
    const failures = [
      { error: new NotFoundError("The reservation does not exist.", "RESERVATION_NOT_FOUND"), status: 404 },
      { error: new ErrorClass("Changes close 48 hours before the slot starts.", 422, "CHANGE_CLOSED"), status: 422 },
      { error: new ConflictError("Not enough free seats in this slot.", "NOT_ENOUGH_SEATS"), status: 409 },
    ];

    for (const { error, status } of failures) {
      changeBookingMock.mock.mockImplementationOnce(async () => {
        throw error;
      });

      const response = await request("/reservations/31", {
        method: "PATCH",
        body: { partySize: 5 },
      });

      assert.equal(response.status, status);
      assert.equal((await response.json()).error, error.code);
    }
  });

  it("rejects invalid reservation ids and incomplete or malformed changes", async () => {
    const changeBookingMock = mock.method(
      reservationService,
      "changeBooking",
      async () => reservations[0],
    );
    const invalidRequests = [
      { path: "/reservations/not-a-number", body: { partySize: 5 } },
      { path: "/reservations/0", body: { partySize: 5 } },
      { path: "/reservations/31", body: {} },
      { path: "/reservations/31", body: { slotId: 0 } },
      { path: "/reservations/31", body: { slotId: "7" } },
      { path: "/reservations/31", body: { partySize: 0 } },
      { path: "/reservations/31", body: { partySize: 1.5 } },
      { path: "/reservations/31", body: { requirements: {} } },
      { path: "/reservations/31", body: { requirements: [null] } },
      { path: "/reservations/31", body: { requirements: [{ peopleCount: 0, description: "Vegan" }] } },
      { path: "/reservations/31", body: { requirements: [{ peopleCount: 1, hasAllergies: "yes", description: "Vegan" }] } },
      { path: "/reservations/31", body: { requirements: [{ peopleCount: 1, description: " " }] } },
      { path: "/reservations/31", body: { requirements: [{ peopleCount: 1, description: "x".repeat(501) }] } },
    ];

    for (const { path, body } of invalidRequests) {
      const response = await request(path, { method: "PATCH", body });
      assert.equal(response.status, 400, path);
      assert.equal((await response.json()).error, "INVALID_INPUT", path);
    }

    assert.equal(changeBookingMock.mock.callCount(), 0);
  });
});
