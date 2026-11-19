import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import staffReservationsRepository from "../../../src/database/staffReservations.repository.js";
import slotRepository from "../../../src/database/slot.repository.js";
import tableAssignmentService from "../../../src/services/tableAssignment.service.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import staffReservationsService from "../../../src/services/staffReservations.service.js";

function createFakeClient() {
  const queries = [];
  let released = false;
  return {
    queries,
    get released() {
      return released;
    },
    async query(sql) {
      queries.push(sql);
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
}

function setupHappyPathMocks(client, overrides = {}) {
  const staffMember = overrides.staffMember ?? {
    id: 3,
    firstName: "Marco",
    lastName: "Rossi",
    role: "employee",
  };
  const slot = overrides.slot ?? {
    id: 7,
    start_at: "2099-12-15T11:00:00.000Z",
    started: false,
  };
  const freeTables = overrides.freeTables ?? [{ id: 1, tableNumber: 1, seats: 4 }];
  const assignedTables = "assignedTables" in overrides ? overrides.assignedTables : [{ id: 1, tableNumber: 1, seats: 4 }];
  const timestamps = overrides.timestamps ?? {
    created_at: "2099-12-01T08:00:00.000Z",
    updated_at: null,
  };

  mock.method(pool, "connect", async () => client);
  mock.method(staffReservationsRepository, "findStaffMemberById", async () => staffMember);
  mock.method(slotRepository, "lockSlotById", async () => slot);
  mock.method(slotRepository, "findFreeTablesBySlotId", async () => freeTables);
  mock.method(tableAssignmentService, "assignTables", () => assignedTables);
  mock.method(staffReservationsRepository, "insertStaffReservation", async () => 77);
  mock.method(reservationRepository, "insertReservationSeats", async () => {});
  mock.method(reservationRepository, "insertReservationRequirements", async () => {});
  mock.method(reservationRepository, "getReservationTimestamps", async () => timestamps);
  mock.method(reservationRepository, "getReservationRequirements", async () => overrides.savedRequirements ?? []);
  mock.method(confirmationEmailService, "sendBookingConfirmation", async () => overrides.emailSent ?? true);

  return { staffMember, slot };
}

afterEach(() => {
  mock.reset();
});

describe("staffReservations service unit tests (MH-07)", () => {
  describe("hiker payload validation (before opening a DB connection)", () => {
    it("rejects non-object temporaryHiker or newHiker payloads with 400 INVALID_INPUT", async () => {
      const connectMock = mock.method(pool, "connect", async () => createFakeClient());

      for (const badPayload of [null, [], "Luca", 42]) {
        await assert.rejects(
          () =>
            staffReservationsService.createStaffReservation(3, {
              slotId: 7,
              partySize: 2,
              requirements: [],
              temporaryHiker: badPayload,
            }),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );

        await assert.rejects(
          () =>
            staffReservationsService.createStaffReservation(3, {
              slotId: 7,
              partySize: 2,
              requirements: [],
              newHiker: badPayload,
            }),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );
      }

      assert.equal(connectMock.mock.callCount(), 0);
    });

    it("rejects unsupported fields in temporaryHiker or newHiker", async () => {
      const connectMock = mock.method(pool, "connect", async () => createFakeClient());

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            temporaryHiker: { firstName: "Luca", lastName: "Neri", email: "luca@example.com" },
          }),
        (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
      );

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            newHiker: {
              email: "anna@example.com",
              firstName: "Anna",
              lastName: "Neri",
              isTemporary: false,
            },
          }),
        (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
      );

      assert.equal(connectMock.mock.callCount(), 0);
    });

    it("validates required firstName and lastName length (1..100 chars)", async () => {
      const connectMock = mock.method(pool, "connect", async () => createFakeClient());
      const longName = "A".repeat(101);

      const invalidNames = [
        { firstName: "", lastName: "Neri" },
        { firstName: "   ", lastName: "Neri" },
        { firstName: "Luca", lastName: "" },
        { firstName: 123, lastName: "Neri" },
        { firstName: longName, lastName: "Neri" },
        { firstName: "Luca", lastName: longName },
      ];

      for (const temporaryHiker of invalidNames) {
        await assert.rejects(
          () =>
            staffReservationsService.createStaffReservation(3, {
              slotId: 7,
              partySize: 2,
              requirements: [],
              temporaryHiker,
            }),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );
      }

      assert.equal(connectMock.mock.callCount(), 0);
    });

    it("validates phone numbers (digits only, max 10 characters)", async () => {
      const connectMock = mock.method(pool, "connect", async () => createFakeClient());

      for (const phone of [3331234567, "+393331234", "333-1234", "12345678901"]) {
        await assert.rejects(
          () =>
            staffReservationsService.createStaffReservation(3, {
              slotId: 7,
              partySize: 2,
              requirements: [],
              temporaryHiker: { firstName: "Luca", lastName: "Neri", phone },
            }),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );
      }

      assert.equal(connectMock.mock.callCount(), 0);
    });

    it("validates full hiker email, emergency contact pairing/lengths, and notes length", async () => {
      const connectMock = mock.method(pool, "connect", async () => createFakeClient());
      const baseHiker = {
        email: "anna@example.com",
        firstName: "Anna",
        lastName: "Neri",
      };

      const invalidFullHikers = [
        { ...baseHiker, email: "not-an-email" },
        { ...baseHiker, email: `${"a".repeat(250)}@b.com` },
        { ...baseHiker, emergencyContactName: "Marco Neri" },
        { ...baseHiker, emergencyContactPhone: "3331234567" },
        { ...baseHiker, emergencyContactName: "M".repeat(101), emergencyContactPhone: "3331234567" },
        { ...baseHiker, emergencyContactName: "Marco", emergencyContactPhone: "abc" },
        { ...baseHiker, notes: "N".repeat(1001) },
        { ...baseHiker, notes: 999 },
      ];

      for (const newHiker of invalidFullHikers) {
        await assert.rejects(
          () =>
            staffReservationsService.createStaffReservation(3, {
              slotId: 7,
              partySize: 2,
              requirements: [],
              newHiker,
            }),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );
      }

      assert.equal(connectMock.mock.callCount(), 0);
    });
  });

  describe("transactional error handling and rollback", () => {
    it("rolls back with 401 NOT_AUTHENTICATED when staff member does not exist", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client);
      mock.method(staffReservationsRepository, "findStaffMemberById", async () => null);

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(999, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            temporaryHiker: { firstName: "Luca", lastName: "Neri" },
          }),
        (err) => err.statusCode === 401 && err.code === "NOT_AUTHENTICATED",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });

    it("rolls back with 404 HIKER_NOT_FOUND when hikerId does not match a hiker", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client);
      mock.method(staffReservationsRepository, "findHikerById", async () => null);

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            hikerId: 404,
          }),
        (err) => err.statusCode === 404 && err.code === "HIKER_NOT_FOUND",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });

    it("rolls back with 404 SLOT_NOT_FOUND when slot does not exist", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client);
      mock.method(slotRepository, "lockSlotById", async () => null);

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 404,
            partySize: 2,
            requirements: [],
            temporaryHiker: { firstName: "Luca", lastName: "Neri" },
          }),
        (err) => err.statusCode === 404 && err.code === "SLOT_NOT_FOUND",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });

    it("rolls back with 422 SLOT_STARTED when the slot has already started", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client, {
        slot: { id: 7, start_at: "2020-01-01T11:00:00.000Z", started: true },
      });

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            temporaryHiker: { firstName: "Luca", lastName: "Neri" },
          }),
        (err) => err.statusCode === 422 && err.code === "SLOT_STARTED",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });

    it("rolls back with 409 ALREADY_BOOKED when existing hiker already has a reservation in that slot", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client);
      mock.method(staffReservationsRepository, "findHikerById", async () => ({
        id: 4,
        first_name: "Anna",
        last_name: "Neri",
        email: "anna@example.com",
        phone: null,
        is_temporary: false,
      }));
      mock.method(reservationRepository, "hasConfirmedReservation", async () => true);

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            hikerId: 4,
          }),
        (err) => err.statusCode === 409 && err.code === "ALREADY_BOOKED",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });

    it("rolls back with 409 NOT_ENOUGH_SEATS when table assignment cannot fit the party", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client, { assignedTables: null });

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 12,
            requirements: [],
            temporaryHiker: { firstName: "Luca", lastName: "Neri" },
          }),
        (err) => err.statusCode === 409 && err.code === "NOT_ENOUGH_SEATS",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });

    it("maps unique email violation (23505) on insertHiker to 409 EMAIL_ALREADY_USED", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client);
      mock.method(staffReservationsRepository, "insertHiker", async () => {
        const dbErr = new Error("duplicate key value");
        dbErr.code = "23505";
        dbErr.constraint = "app_user_email_key";
        throw dbErr;
      });

      await assert.rejects(
        () =>
          staffReservationsService.createStaffReservation(3, {
            slotId: 7,
            partySize: 2,
            requirements: [],
            newHiker: {
              email: "anna@example.com",
              firstName: "Anna",
              lastName: "Neri",
            },
          }),
        (err) => err.statusCode === 409 && err.code === "EMAIL_ALREADY_USED",
      );

      assert.deepEqual(client.queries, ["BEGIN", "ROLLBACK"]);
      assert.equal(client.released, true);
    });
  });

  describe("successful staff reservations", () => {
    it("books for an existing registered hiker with requirements and sends confirmation email", async () => {
      const client = createFakeClient();
      const savedRequirements = [
        { id: 12, peopleCount: 1, hasAllergies: true, description: "Gluten free" },
      ];
      const { staffMember } = setupHappyPathMocks(client, { savedRequirements });

      mock.method(staffReservationsRepository, "findHikerById", async () => ({
        id: 4,
        first_name: "Anna",
        last_name: "Neri",
        email: "anna@example.com",
        phone: "3331234567",
        is_temporary: false,
      }));
      mock.method(reservationRepository, "hasConfirmedReservation", async () => false);
      const insertHikerMock = mock.method(staffReservationsRepository, "insertHiker", async () => ({}));
      const insertReqMock = mock.method(reservationRepository, "insertReservationRequirements", async () => {});
      const emailMock = mock.method(confirmationEmailService, "sendBookingConfirmation", async () => true);

      const requirementsInput = [{ peopleCount: 1, hasAllergies: true, description: "Gluten free" }];
      const result = await staffReservationsService.createStaffReservation(3, {
        slotId: 7,
        partySize: 2,
        requirements: requirementsInput,
        hikerId: 4,
      });

      assert.equal(insertHikerMock.mock.callCount(), 0);
      assert.equal(insertReqMock.mock.callCount(), 1);
      assert.deepEqual(emailMock.mock.calls[0].arguments, [77]);
      assert.deepEqual(client.queries, ["BEGIN", "COMMIT"]);
      assert.equal(client.released, true);
      assert.equal("temporaryPassword" in result, false);
      assert.deepEqual(result, {
        id: 77,
        slotId: 7,
        startAt: "2099-12-15T11:00:00.000Z",
        partySize: 2,
        status: "confirmed",
        tables: [{ tableNumber: 1, seats: 4 }],
        requirements: savedRequirements,
        createdAt: "2099-12-01T08:00:00.000Z",
        updatedAt: null,
        hiker: {
          id: 4,
          firstName: "Anna",
          lastName: "Neri",
          email: "anna@example.com",
          phone: "3331234567",
          isTemporary: false,
        },
        createdBy: staffMember,
        confirmationSent: true,
      });
    });

    it("creates a temporary hiker without credentials or confirmation email", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client);

      const insertHikerMock = mock.method(staffReservationsRepository, "insertHiker", async () => ({
        id: 15,
        first_name: "Luca",
        last_name: "Bianchi",
        email: null,
        phone: null,
        is_temporary: true,
      }));
      const insertReqMock = mock.method(reservationRepository, "insertReservationRequirements", async () => {});
      const emailMock = mock.method(confirmationEmailService, "sendBookingConfirmation", async () => true);

      const result = await staffReservationsService.createStaffReservation(3, {
        slotId: 7,
        partySize: 3,
        requirements: [],
        temporaryHiker: { firstName: "  Luca ", lastName: " Bianchi ", phone: "   " },
      });

      assert.equal(insertHikerMock.mock.callCount(), 1);
      const [, normalizedArg, hashArg, saltArg] = insertHikerMock.mock.calls[0].arguments;
      assert.deepEqual(normalizedArg, {
        email: null,
        firstName: "Luca",
        lastName: "Bianchi",
        phone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        isTemporary: true,
      });
      assert.equal(hashArg, null);
      assert.equal(saltArg, null);
      assert.equal(insertReqMock.mock.callCount(), 0);
      assert.equal(emailMock.mock.callCount(), 0);
      assert.equal(result.confirmationSent, false);
      assert.equal("temporaryPassword" in result, false);
      assert.equal(result.hiker.isTemporary, true);
    });

    it("creates a new full hiker account with hashed credentials and a 12-char temporaryPassword", async () => {
      const client = createFakeClient();
      setupHappyPathMocks(client, { emailSent: false });

      const insertHikerMock = mock.method(staffReservationsRepository, "insertHiker", async () => ({
        id: 22,
        first_name: "Elena",
        last_name: "Verdi",
        email: "elena@example.com",
        phone: "3471112233",
        is_temporary: false,
      }));

      const result = await staffReservationsService.createStaffReservation(3, {
        slotId: 7,
        partySize: 2,
        requirements: [],
        newHiker: {
          email: "  ELENA@Example.com ",
          firstName: "Elena",
          lastName: "Verdi",
          phone: "3471112233",
          emergencyContactName: "Paolo Verdi",
          emergencyContactPhone: "3479998877",
          notes: "  Vegetarian  ",
        },
      });

      assert.equal(insertHikerMock.mock.callCount(), 1);
      const [, normalizedArg, hashArg, saltArg] = insertHikerMock.mock.calls[0].arguments;
      assert.deepEqual(normalizedArg, {
        email: "elena@example.com",
        firstName: "Elena",
        lastName: "Verdi",
        phone: "3471112233",
        emergencyContactName: "Paolo Verdi",
        emergencyContactPhone: "3479998877",
        notes: "Vegetarian",
        isTemporary: false,
      });
      assert.equal(typeof hashArg, "string");
      assert.ok(hashArg.length > 0);
      assert.equal(typeof saltArg, "string");
      assert.ok(saltArg.length > 0);

      assert.equal(typeof result.temporaryPassword, "string");
      assert.equal(result.temporaryPassword.length, 12);
      assert.equal(result.confirmationSent, false);
      assert.deepEqual(client.queries, ["BEGIN", "COMMIT"]);
    });
  });
});