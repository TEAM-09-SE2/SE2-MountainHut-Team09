import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";

afterEach(() => {
  mock.reset();
});

//Fake client: answers each query with the next prepared result and records the SQL and values
function fakeClient(results) {
  const queue = [...results];
  return {
    query: mock.fn(async (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [] };
    }),
    release: mock.fn(),
  };
}

const dataQueries = (client) =>
  client.query.mock.calls.map((call) => call.arguments).filter(([sql]) => !/^(BEGIN|COMMIT|ROLLBACK)/.test(sql));

//One row of the main staff query, with the hiker, creator and canceller columns
const reservationRow = (overrides = {}) => ({
  id: 31,
  slot_id: 7,
  start_at: new Date("2026-12-15T11:00:00.000Z"),
  end_at: new Date("2026-12-15T12:00:00.000Z"),
  party_size: 4,
  status: "confirmed",
  created_at: new Date("2026-12-01T08:00:00.000Z"),
  updated_at: null,
  cancelled_at: null,
  confirmation_sent: true,
  hiker_id: 4,
  hiker_email: "anna@example.com",
  hiker_first_name: "Anna",
  hiker_last_name: "Neri",
  hiker_phone: "3331234567",
  hiker_emergency_contact_name: "Marco Neri",
  hiker_emergency_contact_phone: "3337654321",
  hiker_notes: null,
  hiker_is_temporary: false,
  creator_id: null,
  creator_first_name: null,
  creator_last_name: null,
  creator_role: null,
  canceller_id: null,
  canceller_first_name: null,
  canceller_last_name: null,
  canceller_role: null,
  ...overrides,
});

describe("insertReservationRequirements_unit", () => {
  // Verifies one row is inserted per requirement, in the given client, and each is returned with its new id.
  it("inserts every requirement and returns it with its id", async () => {
    const client = fakeClient([{ rows: [{ id: 12 }] }, { rows: [{ id: 13 }] }]);
    const requirements = [
      { peopleCount: 1, hasAllergies: true, description: "Vegan, peanut allergy" },
      { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
    ];

    const saved = await reservationRepository.insertReservationRequirements(client, 31, requirements);

    assert.deepEqual(saved, [{ id: 12, ...requirements[0] }, { id: 13, ...requirements[1] }]);
    assert.deepEqual(client.query.mock.calls.map((call) => call.arguments[1]), [
      [31, 1, true, "Vegan, peanut allergy"],
      [31, 2, false, "Vegetarians"],
    ]);
  });

  // Verifies an empty list runs no query and returns an empty list.
  it("runs no query for an empty list", async () => {
    const client = fakeClient([]);

    assert.deepEqual(await reservationRepository.insertReservationRequirements(client, 31, []), []);
    assert.equal(client.query.mock.callCount(), 0);
  });
});

describe("getConfirmationData_unit", () => {
  // Verifies the email data includes the requirements, read with allergies first.
  it("returns the requirements of the booking, allergies first", async () => {
    const queryMock = mock.method(pool, "query", async (sql) =>
      /reservation_requirement/.test(sql)
        ? { rows: [{ people_count: 1, has_allergies: true, description: "Shellfish allergy" }] }
        : { rows: [{ id: 31, party_size: 4, email: "anna@example.com", first_name: "Anna", last_name: "Neri", start_at: "s", end_at: "e" }] });

    const data = await reservationRepository.getConfirmationData(31);

    assert.deepEqual(data.requirements, [{ peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" }]);
    assert.match(queryMock.mock.calls[1].arguments[0], /ORDER BY has_allergies DESC, id/);
  });

  // Verifies a missing booking returns null without reading its requirements.
  it("returns null without reading requirements when the booking does not exist", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [] }));

    assert.equal(await reservationRepository.getConfirmationData(404), null);
    assert.equal(queryMock.mock.callCount(), 1);
  });
});

describe("getStaffReservations_unit", () => {
  // Verifies no WHERE clause is used without filters, and the read runs in a read-only snapshot.
  it("reads every booking in a read-only repeatable read transaction when no filter is given", async () => {
    const client = fakeClient([{ rows: [] }]);
    mock.method(pool, "connect", async () => client);

    const result = await reservationRepository.getStaffReservations({});

    assert.deepEqual(result, []);
    const sqls = client.query.mock.calls.map((call) => call.arguments[0]);
    assert.equal(sqls[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.doesNotMatch(sqls[1], /WHERE/);
    assert.match(sqls[1], /ORDER BY s\.start_at, r\.created_at, r\.id/);
    assert.equal(sqls.at(-1), "COMMIT");
    //No bookings: tables and requirements are not queried
    assert.equal(dataQueries(client).length, 1);
    assert.equal(client.release.mock.callCount(), 1);
  });

  // Verifies each filter becomes a numbered parameter, and the date is compared in hut time.
  it("turns the filters into numbered parameters, with the date in Europe/Rome time", async () => {
    const client = fakeClient([{ rows: [] }]);
    mock.method(pool, "connect", async () => client);

    await reservationRepository.getStaffReservations({ date: "2026-12-15", slotId: 7, status: "confirmed" });

    const [sql, values] = dataQueries(client)[0];
    assert.deepEqual(values, ["2026-12-15", 7, "confirmed"]);
    assert.match(sql, /\(s\.start_at AT TIME ZONE 'Europe\/Rome'\)::date = \$1::date/);
    assert.match(sql, /r\.slot_id = \$2/);
    assert.match(sql, /r\.status = \$3/);
  });

  // Verifies a row becomes the documented booking shape, with tables and requirements grouped per booking.
  it("builds each booking with its hiker, tables, requirements and allergy flag", async () => {
    const client = fakeClient([
      { rows: [reservationRow(), reservationRow({ id: 32, hiker_email: null, hiker_is_temporary: true, creator_id: 2, creator_first_name: "Giulia", creator_last_name: "Bianchi", creator_role: "employee" })] },
      { rows: [
        { reservation_id: 31, table_number: 3, seats: 3 },
        { reservation_id: 31, table_number: 5, seats: 1 },
        { reservation_id: 32, table_number: 1, seats: 2 },
      ] },
      { rows: [
        { id: 12, reservation_id: 31, people_count: 1, has_allergies: true, description: "Shellfish allergy" },
        { id: 13, reservation_id: 31, people_count: 2, has_allergies: false, description: "Vegetarians" },
        { id: 14, reservation_id: 32, people_count: 1, has_allergies: false, description: "Vegan" },
      ] },
    ]);
    mock.method(pool, "connect", async () => client);

    const [first, second] = await reservationRepository.getStaffReservations({});

    assert.deepEqual(first, {
      id: 31,
      slot: { id: 7, startAt: new Date("2026-12-15T11:00:00.000Z"), endAt: new Date("2026-12-15T12:00:00.000Z") },
      partySize: 4,
      status: "confirmed",
      createdAt: new Date("2026-12-01T08:00:00.000Z"),
      updatedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      confirmationSent: true,
      hiker: {
        id: 4,
        email: "anna@example.com",
        firstName: "Anna",
        lastName: "Neri",
        phone: "3331234567",
        emergencyContactName: "Marco Neri",
        emergencyContactPhone: "3337654321",
        notes: null,
        isTemporary: false,
      },
      createdBy: null,
      tables: [{ tableNumber: 3, seats: 3 }, { tableNumber: 5, seats: 1 }],
      hasAllergies: true,
      requirements: [
        { id: 12, peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" },
        { id: 13, peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
      ],
    });
    assert.equal(second.hasAllergies, false);
    assert.equal(second.hiker.email, null);
    assert.equal(second.hiker.isTemporary, true);
    assert.deepEqual(second.createdBy, { id: 2, firstName: "Giulia", lastName: "Bianchi", role: "employee" });
    assert.deepEqual(second.tables, [{ tableNumber: 1, seats: 2 }]);
    //Tables and requirements are read once for all the bookings, requirements with allergies first
    const [tablesQuery, requirementsQuery] = dataQueries(client).slice(1);
    assert.deepEqual(tablesQuery[1], [[31, 32]]);
    assert.match(requirementsQuery[0], /ORDER BY reservation_id, has_allergies DESC, id/);
  });

  // Verifies a cancelled booking returns who cancelled it.
  it("returns cancelledAt and cancelledBy for a cancelled booking", async () => {
    const cancelledAt = new Date("2026-12-10T09:00:00.000Z");
    const client = fakeClient([
      { rows: [reservationRow({ status: "cancelled", cancelled_at: cancelledAt, canceller_id: 4, canceller_first_name: "Anna", canceller_last_name: "Neri", canceller_role: "hiker" })] },
      { rows: [] },
      { rows: [] },
    ]);
    mock.method(pool, "connect", async () => client);

    const [booking] = await reservationRepository.getStaffReservations({ status: "cancelled" });

    assert.equal(booking.cancelledAt, cancelledAt);
    assert.deepEqual(booking.cancelledBy, { id: 4, firstName: "Anna", lastName: "Neri", role: "hiker" });
  });

  // Verifies a failed query rolls back, releases the connection and rethrows the error.
  it("rolls back and releases the connection when a query fails", async () => {
    const databaseError = new Error("connection terminated");
    const client = fakeClient([databaseError]);
    mock.method(pool, "connect", async () => client);

    await assert.rejects(reservationRepository.getStaffReservations({}), databaseError);

    const sqls = client.query.mock.calls.map((call) => call.arguments[0]);
    assert.equal(sqls.at(-1), "ROLLBACK");
    assert.equal(sqls.includes("COMMIT"), false);
    assert.equal(client.release.mock.callCount(), 1);
  });
});
