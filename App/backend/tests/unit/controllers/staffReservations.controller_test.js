import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import staffReservationsController from "../../../src/controllers/staffReservations.controller.js";
import staffReservationsService from "../../../src/services/staffReservations.service.js";

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

afterEach(() => {
  mock.reset();
});

describe("staff reservations controller unit tests (MH-07)", () => {
  it("rejects non-object bodies or invalid slotId/partySize with 400 INVALID_INPUT", async () => {
    const serviceMock = mock.method(staffReservationsService, "createStaffReservation", async () => ({}));

    const invalidBodies = [
      null,
      [],
      "invalid",
      { slotId: 0, partySize: 2, temporaryHiker: { firstName: "A", lastName: "B" } },
      { slotId: 1, partySize: -1, temporaryHiker: { firstName: "A", lastName: "B" } },
      { slotId: 1, partySize: 2.5, temporaryHiker: { firstName: "A", lastName: "B" } },
    ];

    for (const body of invalidBodies) {
      const req = { user: { id: 3 }, body };
      const res = createRes();

      await assert.rejects(
        () => staffReservationsController.createReservation(req, res),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "INVALID_INPUT");
          return true;
        },
      );
    }

    assert.equal(serviceMock.mock.callCount(), 0);
  });

  it("requires exactly one of hikerId, newHiker, or temporaryHiker", async () => {
    const serviceMock = mock.method(staffReservationsService, "createStaffReservation", async () => ({}));

    const missingSelection = { slotId: 5, partySize: 2 };
    const multipleSelection = {
      slotId: 5,
      partySize: 2,
      hikerId: 1,
      temporaryHiker: { firstName: "Luca", lastName: "Neri" },
    };

    for (const body of [missingSelection, multipleSelection]) {
      const req = { user: { id: 3 }, body };
      const res = createRes();

      await assert.rejects(
        () => staffReservationsController.createReservation(req, res),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "INVALID_INPUT");
          return true;
        },
      );
    }

    assert.equal(serviceMock.mock.callCount(), 0);
  });

  it("rejects non-positive-integer hikerId with 400 INVALID_INPUT", async () => {
    const serviceMock = mock.method(staffReservationsService, "createStaffReservation", async () => ({}));

    for (const hikerId of [0, -5, "abc", 1.5]) {
      const req = { user: { id: 3 }, body: { slotId: 5, partySize: 2, hikerId } };
      const res = createRes();

      await assert.rejects(
        () => staffReservationsController.createReservation(req, res),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "INVALID_INPUT");
          return true;
        },
      );
    }

    assert.equal(serviceMock.mock.callCount(), 0);
  });

  it("delegates valid requests to staffReservationsService and returns 201", async () => {
    const created = { id: 99, slotId: 5, partySize: 2, status: "confirmed" };
    const serviceMock = mock.method(
      staffReservationsService,
      "createStaffReservation",
      async () => created,
    );

    const req = {
      user: { id: 3 },
      body: {
        slotId: 5,
        partySize: 2,
        requirements: [],
        temporaryHiker: { firstName: "Luca", lastName: "Neri" },
      },
    };
    const res = createRes();

    await staffReservationsController.createReservation(req, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, created);
    assert.equal(serviceMock.mock.callCount(), 1);
    assert.deepEqual(serviceMock.mock.calls[0].arguments[0], 3);
  });
});