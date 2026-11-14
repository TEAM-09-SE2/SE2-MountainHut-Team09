import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationController from "../../../src/controllers/reservation.controller.js";
import reservationService from "../../../src/services/reservation.service.js";
import { BadRequestError } from "../../../src/errors/ErrorClass.js";

afterEach(() => {
  mock.reset();
});

function createResponse() {
  return {
    status: mock.fn(function (statusCode) { this.statusCode = statusCode; return this; }),
    json: mock.fn(function (body) { this.body = body; return this; }),
  };
}

const hiker = { id: 5, role: "hiker" };
const book = (body) => reservationController.createReservation({ body, user: hiker }, createResponse());

async function assertInvalidInput(promise) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof BadRequestError);
    assert.equal(error.code, "INVALID_INPUT");
    return true;
  });
}

describe("reservationController.createReservation requirements (MH-05)", () => {
  // Verifies valid requirements reach the service trimmed and without extra fields.
  it("passes the requirements to the service trimmed and with only the documented fields", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation", async () => ({ id: 31 }));

    await book({
      slotId: 7,
      partySize: 4,
      requirements: [
        { peopleCount: 1, hasAllergies: true, description: "  Vegan, peanut allergy  ", extra: "ignored" },
        { peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" },
        { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
      ],
    });

    assert.deepEqual(createReservationMock.mock.calls[0].arguments, [5, 7, 4, [
      { peopleCount: 1, hasAllergies: true, description: "Vegan, peanut allergy" },
      { peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" },
      { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
    ]]);
  });

  // Verifies a missing or empty list means no requirements.
  it("passes an empty list when requirements are missing or empty", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation", async () => ({ id: 31 }));

    await book({ slotId: 7, partySize: 2 });
    await book({ slotId: 7, partySize: 2, requirements: [] });

    assert.deepEqual(createReservationMock.mock.calls[0].arguments[3], []);
    assert.deepEqual(createReservationMock.mock.calls[1].arguments[3], []);
  });

  // Verifies the requirements may cover the whole party, but not more people than partySize.
  it("accepts requirements that cover exactly partySize and refuses more", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation", async () => ({ id: 31 }));
    const requirement = (peopleCount) => ({ peopleCount, hasAllergies: false, description: "Vegetarians" });

    await book({ slotId: 7, partySize: 3, requirements: [requirement(1), requirement(2)] });
    await assertInvalidInput(book({ slotId: 7, partySize: 3, requirements: [requirement(2), requirement(2)] }));

    assert.equal(createReservationMock.mock.callCount(), 1);
  });

  // Verifies every broken requirement rule answers 400 INVALID_INPUT without calling the service.
  it("refuses requirements that break a documented rule", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation");
    const valid = { peopleCount: 1, hasAllergies: false, description: "Vegetarian" };
    const invalidLists = [
      "vegan",
      { ...valid },
      null,
      [null],
      ["vegan"],
      [[valid]],
      [{ ...valid, peopleCount: 0 }],
      [{ ...valid, peopleCount: 1.5 }],
      [{ ...valid, peopleCount: "1" }],
      [{ ...valid, hasAllergies: "yes" }],
      [{ ...valid, hasAllergies: undefined }],
      [{ ...valid, description: 42 }],
      [{ ...valid, description: "   " }],
      [{ ...valid, description: "d".repeat(501) }],
    ];

    for (const requirements of invalidLists) {
      await assertInvalidInput(book({ slotId: 7, partySize: 2, requirements }));
    }

    assert.equal(createReservationMock.mock.callCount(), 0);
  });

  // Verifies the 500-character limit applies after trimming.
  it("accepts a description of 500 characters once trimmed", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation", async () => ({ id: 31 }));

    await book({ slotId: 7, partySize: 1, requirements: [{ peopleCount: 1, hasAllergies: false, description: ` ${"d".repeat(500)} ` }] });

    assert.equal(createReservationMock.mock.calls[0].arguments[3][0].description.length, 500);
  });

  // Verifies slotId and partySize must fit a PostgreSQL integer.
  it("refuses slotId or partySize above the PostgreSQL integer range", async () => {
    const createReservationMock = mock.method(reservationService, "createReservation");

    await assertInvalidInput(book({ slotId: 2147483648, partySize: 2 }));
    await assertInvalidInput(book({ slotId: 7, partySize: 2147483648 }));

    assert.equal(createReservationMock.mock.callCount(), 0);
  });
});

describe("reservationController.getStaffReservations (MH-05)", () => {
  const list = (query) => {
    const res = createResponse();
    return { res, promise: reservationController.getStaffReservations({ query, user: { id: 2, role: "employee" } }, res) };
  };

  // Verifies the list is returned with 200 and no filter is passed when the query is empty.
  it("returns 200 with all the reservations when no filter is given", async () => {
    const reservations = [{ id: 31 }];
    const serviceMock = mock.method(reservationService, "getStaffReservations", async () => reservations);
    const { res, promise } = list({});

    await promise;

    assert.deepEqual(serviceMock.mock.calls[0].arguments, [{}]);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, reservations);
  });

  // Verifies the filters are validated and slotId is converted to a number.
  it("passes the valid filters to the service, with slotId as a number", async () => {
    const serviceMock = mock.method(reservationService, "getStaffReservations", async () => []);
    const { promise } = list({ date: "2028-02-29", slotId: "7", status: "cancelled" });

    await promise;

    assert.deepEqual(serviceMock.mock.calls[0].arguments, [{ date: "2028-02-29", slotId: 7, status: "cancelled" }]);
  });

  // Verifies every invalid filter answers 400 INVALID_INPUT without calling the service.
  it("refuses invalid date, slotId and status filters", async () => {
    const serviceMock = mock.method(reservationService, "getStaffReservations");
    const invalidQueries = [
      { date: "2026-02-30" },
      { date: "2027-02-29" },
      { date: "2026-13-01" },
      { date: "15-12-2026" },
      { date: "2026-12-1" },
      { date: "0000-01-01" },
      { date: "" },
      { date: ["2026-12-15", "2026-12-16"] },
      { slotId: "0" },
      { slotId: "-1" },
      { slotId: "1.5" },
      { slotId: "abc" },
      { slotId: "2147483648" },
      { slotId: ["7", "8"] },
      { status: "pending" },
      { status: "CONFIRMED" },
      { status: "" },
    ];

    for (const query of invalidQueries) {
      await assertInvalidInput(list(query).promise);
    }

    assert.equal(serviceMock.mock.callCount(), 0);
  });
});
