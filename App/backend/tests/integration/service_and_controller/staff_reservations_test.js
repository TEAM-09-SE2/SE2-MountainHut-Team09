import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import reservationRepository from "../../../src/database/reservation.repository.js";

const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = "reservation-list-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

//Shape of one booking as the repository returns it (dates already serialised)
const listedBooking = () => ({
  id: 31,
  slot: { id: 7, startAt: "2099-12-15T11:00:00.000Z", endAt: "2099-12-15T12:00:00.000Z" },
  partySize: 4,
  status: "confirmed",
  cancellable: true,
  createdAt: "2099-12-01T08:00:00.000Z",
  updatedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  confirmationSent: true,
  hiker: {
    id: 4,
    email: "anna@example.com",
    firstName: "Anna",
    lastName: "Neri",
    phone: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    isTemporary: false,
  },
  createdBy: null,
  tables: [{ tableNumber: 1, seats: 4 }],
  hasAllergies: true,
  requirements: [{ id: 12, peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" }],
});

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

const loginCookie = (role, id = 2) => `token=${jwt.sign({ id, role }, testJwtSecret, { expiresIn: "1d" })}`;

async function list(query = "", { cookie = loginCookie("employee") } = {}) {
  const headers = cookie ? { cookie } : {};
  const response = await fetch(`${baseUrl}${query}`, { headers });
  return { status: response.status, body: await response.json() };
}

describe("staff bookings list controller and service integration (MH-05)", () => {
  // Verifies employees and wardens get the list read by the repository, unchanged.
  it("returns 200 with the bookings for employees and wardens", async () => {
    const repositoryMock = mock.method(reservationRepository, "getStaffReservations", async () => [listedBooking()]);

    for (const role of ["employee", "warden"]) {
      const { status, body } = await list("", { cookie: loginCookie(role) });

      assert.equal(status, 200, role);
      assert.deepEqual(body, [listedBooking()], role);
    }
    assert.deepEqual(repositoryMock.mock.calls.map((call) => call.arguments), [[{}], [{}]]);
  });

  // Verifies the query string reaches the repository as validated filters, with slotId as a number.
  it("passes the query filters to the repository", async () => {
    const repositoryMock = mock.method(reservationRepository, "getStaffReservations", async () => []);

    const { status, body } = await list("?date=2099-12-15&slotId=7&status=confirmed");

    assert.equal(status, 200);
    assert.deepEqual(body, []);
    assert.deepEqual(repositoryMock.mock.calls[0].arguments, [{ date: "2099-12-15", slotId: 7, status: "confirmed" }]);
  });

  // Verifies the list is refused without login and for hikers, without reading the database.
  it("answers 401 without login and 403 for hikers", async () => {
    const repositoryMock = mock.method(reservationRepository, "getStaffReservations", async () => []);

    const anonymous = await list("", { cookie: null });
    const hiker = await list("", { cookie: loginCookie("hiker", 4) });

    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error, "NOT_AUTHENTICATED");
    assert.equal(hiker.status, 403);
    assert.equal(hiker.body.error, "FORBIDDEN_ROLE");
    assert.equal(repositoryMock.mock.callCount(), 0);
  });

  // Verifies invalid filters answer 400 INVALID_INPUT through the error handler.
  it("answers 400 INVALID_INPUT for invalid filters", async () => {
    const repositoryMock = mock.method(reservationRepository, "getStaffReservations", async () => []);

    for (const query of ["?date=2099-02-30", "?slotId=abc", "?status=pending", "?slotId=7&slotId=8"]) {
      const { status, body } = await list(query);

      assert.equal(status, 400, query);
      assert.equal(body.error, "INVALID_INPUT", query);
    }
    assert.equal(repositoryMock.mock.callCount(), 0);
  });

  // Verifies a database failure becomes a 500 instead of crashing the request.
  it("answers 500 when the bookings cannot be read", async () => {
    mock.method(reservationRepository, "getStaffReservations", async () => { throw new Error("connection terminated"); });
    mock.method(console, "error", () => {});

    const { status } = await list();

    assert.equal(status, 500);
  });
});
