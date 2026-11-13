import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import slotRepository from "../../../src/database/slot.repository.js";
import { BadRequestError, ConflictError, ErrorClass, NotFoundError } from "../../../src/errors/ErrorClass.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import reservationService from "../../../src/services/reservation.service.js";

afterEach(() => {
  mock.reset();
});

const SLOT_START = new Date("2099-12-15T11:00:00.000Z");
const TARGET_SLOT_START = new Date("2099-12-16T11:00:00.000Z");
const BOOKING_CREATED_AT = new Date("2099-09-01T10:00:00.000Z");
const BOOKING_UPDATED_AT = new Date("2099-10-01T10:00:00.000Z");

function booking(overrides = {}) {
  return {
    id: 31,
    hiker_id: 12,
    slot_id: 7,
    party_size: 4,
    status: "confirmed",
    current_slot_start: SLOT_START,
    ...overrides,
  };
}

function mockChangeBooking({
  existingRequirements = [],
  currentTables = [
    { slotTableId: 71, bookedSeats: 4, freeSeats: 0 },
  ],
  lockedSlots = [{ id: 7, start_at: SLOT_START, bookable: true }],
} = {}) {
  const calls = [];
  const client = {
    query: mock.fn(async (sql) => {
      calls.push(sql);
      if (sql.includes("r.created_at")) {
        return {
          rows: [{
            created_at: BOOKING_CREATED_AT,
            updated_at: BOOKING_UPDATED_AT,
            table_number: null,
            seats: null,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: mock.fn(() => calls.push("release")),
  };
  return {
    calls,
    client,
    connectMock: mock.method(pool, "connect", async () => client),
    bookingMock: mock.method(
      reservationRepository,
      "getBookingForUpdate",
      async () => booking(),
    ),
    requirementsMock: mock.method(
      reservationRepository,
      "getReservationRequirements",
      async () => existingRequirements,
    ),
    lockSlotsMock: mock.method(
      reservationRepository,
      "lockSlotsInOrder",
      async () => lockedSlots,
    ),
    hasReservationMock: mock.method(
      reservationRepository,
      "hasConfirmedReservation",
      async () => false,
    ),
    freeTablesMock: mock.method(
      slotRepository,
      "findFreeTablesBySlotId",
      async () => [
        { slotTableId: 81, tableNumber: 1, freeSeats: 4 },
        { slotTableId: 82, tableNumber: 2, freeSeats: 4 },
      ],
    ),
    currentTablesMock: mock.method(
      reservationRepository,
      "getBookingSeatsWithAvailability",
      async () => currentTables,
    ),
    deleteSeatsMock: mock.method(
      reservationRepository,
      "deleteReservationSeats",
      async () => calls.push("deleteReservationSeats"),
    ),
    updateMock: mock.method(
      reservationRepository,
      "updateReservation",
      async (...args) => calls.push(["updateReservation", ...args]),
    ),
    insertSeatsMock: mock.method(
      reservationRepository,
      "insertReservationSeats",
      async (...args) => calls.push(["insertReservationSeats", ...args]),
    ),
    updateSeatCountMock: mock.method(
      reservationRepository,
      "updateReservationSeatCount",
      async (...args) => calls.push(["updateReservationSeatCount", ...args]),
    ),
    deleteSingleSeatMock: mock.method(
      reservationRepository,
      "deleteSingleReservationSeat",
      async (...args) => calls.push(["deleteSingleReservationSeat", ...args]),
    ),
    deleteRequirementsMock: mock.method(
      reservationRepository,
      "deleteReservationRequirements",
      async () => calls.push("deleteReservationRequirements"),
    ),
    insertRequirementsMock: mock.method(
      reservationRepository,
      "insertReservationRequirements",
      async (...args) => calls.push(["insertReservationRequirements", ...args]),
    ),
    sendUpdateMock: mock.method(
      confirmationEmailService,
      "sendBookingUpdate",
      async () => {
        calls.push("sendBookingUpdate");
        return true;
      },
    ),
  };
}

async function assertServiceError(promise, ErrorType, statusCode, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

describe("MH-06 reservation service", () => {
  it("returns the hiker's reservations from the repository", async () => {
    const expected = [{ id: 31, changeable: true }];
    const getReservationsMock = mock.method(
      reservationRepository,
      "getUpcomingBookingsByHikerId",
      async () => expected,
    );

    assert.equal(await reservationService.getMyReservations(12), expected);
    assert.deepEqual(getReservationsMock.mock.calls[0].arguments, [12]);
  });

  it("replaces requirements transactionally and emails after releasing the connection", async () => {
    const updatedRequirements = [
      { id: 101, peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
    ];
    const mocks = mockChangeBooking();
    mocks.requirementsMock.mock.mockImplementation(async () => updatedRequirements);

    const result = await reservationService.changeBooking(12, 31, {
      requirements: updatedRequirements,
    });

    assert.deepEqual(result, {
      id: 31,
      slotId: 7,
      startAt: SLOT_START,
      partySize: 4,
      status: "confirmed",
      requirements: updatedRequirements,
      tables: [],
      createdAt: BOOKING_CREATED_AT,
      updatedAt: BOOKING_UPDATED_AT,
      confirmationSent: true,
    });
    assert.equal(mocks.deleteRequirementsMock.mock.callCount(), 1);
    assert.deepEqual(mocks.insertRequirementsMock.mock.calls[0].arguments, [
      mocks.client,
      31,
      updatedRequirements,
    ]);
    assert.deepEqual(mocks.calls.slice(-3), ["COMMIT", "release", "sendBookingUpdate"]);
  });

  it("preserves requirements when the patch omits the requirements field", async () => {
    const existingRequirements = [
      { id: 101, peopleCount: 2, hasAllergies: true, description: "Peanuts" },
    ];
    const mocks = mockChangeBooking({ existingRequirements });

    const result = await reservationService.changeBooking(12, 31, {
      slotId: 7,
    });

    assert.deepEqual(result.requirements, existingRequirements);
    assert.equal(mocks.deleteRequirementsMock.mock.callCount(), 0);
    assert.equal(mocks.insertRequirementsMock.mock.callCount(), 0);
  });

  it("clears existing requirements when an empty list is provided", async () => {
    const existingRequirements = [
      { id: 101, peopleCount: 2, hasAllergies: true, description: "Peanuts" },
    ];
    const mocks = mockChangeBooking({ existingRequirements });
    let requirementReads = 0;
    mocks.requirementsMock.mock.mockImplementation(async () => {
      requirementReads += 1;
      return requirementReads === 1 ? existingRequirements : [];
    });

    const result = await reservationService.changeBooking(12, 31, {
      requirements: [],
    });

    assert.deepEqual(result.requirements, []);
    assert.equal(mocks.deleteRequirementsMock.mock.callCount(), 1);
    assert.equal(mocks.insertRequirementsMock.mock.callCount(), 0);
  });

  it("moves a booking to another bookable slot and assigns seats there", async () => {
    const mocks = mockChangeBooking({
      lockedSlots: [
        { id: 7, start_at: SLOT_START, bookable: true },
        { id: 8, start_at: TARGET_SLOT_START, bookable: true },
      ],
    });

    const result = await reservationService.changeBooking(12, 31, { slotId: 8 });

    assert.equal(result.slotId, 8);
    assert.equal(result.startAt, TARGET_SLOT_START);
    assert.deepEqual(mocks.lockSlotsMock.mock.calls[0].arguments[1], [7, 8]);
    assert.equal(mocks.hasReservationMock.mock.calls[0].arguments[2], 8);
    assert.equal(mocks.deleteSeatsMock.mock.callCount(), 1);
    assert.deepEqual(mocks.updateMock.mock.calls[0].arguments.slice(1), [31, 8, 4]);
    assert.equal(mocks.insertSeatsMock.mock.calls[0].arguments[1], 31);
    assert.equal(mocks.calls.includes("COMMIT"), true);
  });

  it("adds seats to the current tables with the most free seats first when possible", async () => {
    const mocks = mockChangeBooking({
      currentTables: [
        { slotTableId: 72, bookedSeats: 2, freeSeats: 3 },
        { slotTableId: 71, bookedSeats: 2, freeSeats: 2 },
      ],
    });

    await reservationService.changeBooking(12, 31, { partySize: 7 });

    assert.deepEqual(mocks.updateSeatCountMock.mock.calls[0].arguments.slice(1), [
      31,
      72,
      5,
    ]);
    assert.equal(mocks.deleteSeatsMock.mock.callCount(), 0);
    assert.equal(mocks.updateMock.mock.calls[0].arguments[3], 7);
  });

  it("reassigns seats when the current tables cannot fit a larger party", async () => {
    const mocks = mockChangeBooking({
      currentTables: [
        { slotTableId: 71, bookedSeats: 4, freeSeats: 1 },
        { slotTableId: 72, bookedSeats: 0, freeSeats: 2 },
      ],
    });

    await reservationService.changeBooking(12, 31, { partySize: 8 });

    assert.equal(mocks.deleteSeatsMock.mock.callCount(), 1);
    assert.equal(mocks.freeTablesMock.mock.calls[0].arguments[1], 7);
    assert.equal(mocks.insertSeatsMock.mock.callCount(), 1);
    assert.equal(mocks.updateMock.mock.calls[0].arguments[3], 8);
  });

  it("rolls back a larger party when reassigned tables still lack enough seats", async () => {
    const mocks = mockChangeBooking();
    mocks.freeTablesMock.mock.mockImplementation(async () => [
      { slotTableId: 81, tableNumber: 1, freeSeats: 2 },
      { slotTableId: 82, tableNumber: 2, freeSeats: 2 },
    ]);

    await assertServiceError(
      reservationService.changeBooking(12, 31, { partySize: 5 }),
      ConflictError,
      409,
      "NOT_ENOUGH_SEATS",
    );

    assert.equal(mocks.deleteSeatsMock.mock.callCount(), 1);
    assert.equal(mocks.updateMock.mock.callCount(), 0);
    assert.equal(mocks.calls.includes("ROLLBACK"), true);
    assert.equal(mocks.sendUpdateMock.mock.callCount(), 0);
  });

  it("releases the smallest occupied table first when a party becomes smaller", async () => {
    const mocks = mockChangeBooking({
      currentTables: [
        { slotTableId: 72, bookedSeats: 3, freeSeats: 1 },
        { slotTableId: 71, bookedSeats: 1, freeSeats: 0 },
      ],
    });

    await reservationService.changeBooking(12, 31, { partySize: 2 });

    assert.deepEqual(mocks.deleteSingleSeatMock.mock.calls[0].arguments.slice(1), [
      31,
      71,
    ]);
    assert.deepEqual(mocks.updateSeatCountMock.mock.calls[0].arguments.slice(1), [
      31,
      72,
      2,
    ]);
    assert.equal(mocks.updateMock.mock.calls[0].arguments[3], 2);
  });

  it("keeps a committed change when the update email cannot be sent", async () => {
    const mocks = mockChangeBooking();
    mocks.sendUpdateMock.mock.mockImplementation(async () => false);

    const result = await reservationService.changeBooking(12, 31, {
      requirements: [],
    });

    assert.equal(result.confirmationSent, false);
    assert.equal(mocks.calls.includes("COMMIT"), true);
    assert.equal(mocks.calls.includes("ROLLBACK"), false);
  });

  it("rolls back changes refused by booking ownership, status, timing, requirements, or slot availability rules", async () => {
    const cases = [
      {
        setup: (mocks) => mocks.bookingMock.mock.mockImplementation(async () => undefined),
        change: { partySize: 5 },
        ErrorType: NotFoundError,
        statusCode: 404,
        code: "RESERVATION_NOT_FOUND",
      },
      {
        setup: (mocks) => mocks.bookingMock.mock.mockImplementation(async () => booking({ status: "cancelled" })),
        change: { partySize: 5 },
        ErrorType: ConflictError,
        statusCode: 409,
        code: "RESERVATION_CANCELLED",
      },
      {
        setup: (mocks) => mocks.bookingMock.mock.mockImplementation(async () => booking({ current_slot_start: new Date(Date.now() + 47 * 60 * 60 * 1000) })),
        change: { partySize: 5 },
        ErrorType: ErrorClass,
        statusCode: 422,
        code: "CHANGE_CLOSED",
      },
      {
        setup: (mocks) => mocks.requirementsMock.mock.mockImplementation(async () => [{ peopleCount: 4 }]),
        change: { partySize: 3 },
        ErrorType: BadRequestError,
        statusCode: 400,
        code: "INVALID_INPUT",
      },
      {
        setup: (mocks) => mocks.lockSlotsMock.mock.mockImplementation(async () => [{ id: 7, start_at: SLOT_START }]),
        change: { slotId: 8 },
        ErrorType: NotFoundError,
        statusCode: 404,
        code: "SLOT_NOT_FOUND",
      },
      {
        setup: (mocks) => mocks.lockSlotsMock.mock.mockImplementation(async () => [
          { id: 7, start_at: SLOT_START },
          { id: 8, start_at: TARGET_SLOT_START, bookable: false },
        ]),
        change: { slotId: 8 },
        ErrorType: ErrorClass,
        statusCode: 422,
        code: "BOOKING_CLOSED",
      },
      {
        setup: (mocks) => mocks.hasReservationMock.mock.mockImplementation(async () => true),
        change: { slotId: 8 },
        ErrorType: ConflictError,
        statusCode: 409,
        code: "ALREADY_BOOKED",
        lockedSlots: [
          { id: 7, start_at: SLOT_START },
          { id: 8, start_at: TARGET_SLOT_START, bookable: true },
        ],
      },
      {
        setup: (mocks) => mocks.freeTablesMock.mock.mockImplementation(async () => [{ slotTableId: 81, tableNumber: 1, freeSeats: 3 }]),
        change: { slotId: 8 },
        ErrorType: ConflictError,
        statusCode: 409,
        code: "NOT_ENOUGH_SEATS",
        lockedSlots: [
          { id: 7, start_at: SLOT_START },
          { id: 8, start_at: TARGET_SLOT_START, bookable: true },
        ],
      },
    ];

    for (const testCase of cases) {
      mock.reset();
      const mocks = mockChangeBooking({
        lockedSlots: testCase.lockedSlots,
      });
      testCase.setup(mocks);

      await assertServiceError(
        reservationService.changeBooking(12, 31, testCase.change),
        testCase.ErrorType,
        testCase.statusCode,
        testCase.code,
      );

      assert.equal(mocks.calls.includes("ROLLBACK"), true, testCase.code);
      assert.equal(mocks.calls.includes("COMMIT"), false, testCase.code);
      assert.equal(mocks.sendUpdateMock.mock.callCount(), 0, testCase.code);
      assert.equal(mocks.client.release.mock.callCount(), 1, testCase.code);
    }
  });
});
