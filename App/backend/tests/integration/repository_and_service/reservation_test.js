import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../../../src/database/connection.js";
import reservationRepository from "../../../src/database/reservation.repository.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";
import reservationService from "../../../src/services/reservation.service.js";
import { insertSlot, purgeTestUsers } from "../../helpers/testData.js";

const TEST_EMAIL_PATTERN = "requirements-integration-%";
//Temporary hikers have no email: they are found again by this last name
const TEMPORARY_LAST_NAME = "RequirementsIntegrationTemporary";
let hiker;
let employee;

async function purgeTestData() {
  //Requirements and seats go with their reservation (ON DELETE CASCADE)
  await purgeTestUsers(TEST_EMAIL_PATTERN, TEMPORARY_LAST_NAME);
}

async function createUser(role, firstName, lastName) {
  const email = `requirements-integration-${randomUUID()}@example.com`;
  const { rows: [user] } = await pool.query(
    "INSERT INTO app_user (email, password_hash, salt, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [email, "not-a-real-password-hash", "not-a-real-salt", firstName, lastName, role],
  );
  return { id: user.id, email };
}

async function createSlot(startAt, endAt, seatsByTable) {
  return insertSlot(employee.id, startAt, endAt, seatsByTable);
}

const STORY_REQUIREMENTS = () => [
  { peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
  { peopleCount: 1, hasAllergies: true, description: "Vegan, peanut allergy" },
  { peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" },
];

const freeSeats = async (slotId) =>
  Number((await pool.query("SELECT COALESCE(SUM(free_seats), 0) AS free FROM slot_table_free WHERE slot_id = $1", [slotId])).rows[0].free);

before(async () => {
  await purgeTestData();
  hiker = await createUser("hiker", "Ada", "Lovelace");
  employee = await createUser("employee", "Giulia", "Bianchi");
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  try {
    await purgeTestData();
  } finally {
    await pool.end();
  }
});

describe("party requirements repository and service integration (MH-05)", () => {
  // Uses PostgreSQL to verify the requirements are stored with the booking and returned with the ids of their rows.
  it("stores the requirements with the booking and returns them with their database ids", async () => {
    mock.method(confirmationEmailService, "sendBookingConfirmation", async () => false);
    const slotId = await createSlot("2093-06-10T12:00:00+02:00", "2093-06-10T13:00:00+02:00", { 1: 6 });

    const booking = await reservationService.createReservation(hiker.id, slotId, 6, STORY_REQUIREMENTS());

    const { rows } = await pool.query(
      "SELECT id, people_count, has_allergies, description FROM reservation_requirement WHERE reservation_id = $1 ORDER BY id",
      [booking.id],
    );
    assert.deepEqual(
      rows.map((row) => ({ id: row.id, peopleCount: row.people_count, hasAllergies: row.has_allergies, description: row.description })),
      booking.requirements,
    );
    assert.equal(rows.length, 3);
  });

  // Uses PostgreSQL to verify a requirement the database refuses undoes the whole booking: no reservation, no seats, no requirements.
  it("rolls back the whole booking when a requirement cannot be stored", async () => {
    const sendMock = mock.method(confirmationEmailService, "sendBookingConfirmation", async () => true);
    const slotId = await createSlot("2093-06-11T12:00:00+02:00", "2093-06-11T13:00:00+02:00", { 1: 4 });
    //The controller trims and refuses this, so here it reaches the database CHECK on the description
    const requirements = [
      { peopleCount: 1, hasAllergies: false, description: "Vegetarian" },
      { peopleCount: 1, hasAllergies: true, description: "   " },
    ];

    await assert.rejects(reservationService.createReservation(hiker.id, slotId, 2, requirements));

    const { rows } = await pool.query("SELECT id FROM reservation WHERE slot_id = $1", [slotId]);
    assert.equal(rows.length, 0);
    assert.equal(await freeSeats(slotId), 4);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Uses PostgreSQL to verify the email reads back every saved requirement of the booking (the email lists allergies first).
  it("reads the saved requirements of the booking for the email", async () => {
    mock.method(confirmationEmailService, "sendBookingConfirmation", async () => false);
    const slotId = await createSlot("2093-06-12T12:00:00+02:00", "2093-06-12T13:00:00+02:00", { 1: 6 });
    const booking = await reservationService.createReservation(hiker.id, slotId, 4, STORY_REQUIREMENTS());

    const requirements = await reservationRepository.getRequirementsByReservationId(booking.id);

    assert.deepEqual(requirements, booking.requirements);
    assert.deepEqual(requirements.map((requirement) => requirement.description), ["Vegetarians", "Vegan, peanut allergy", "Shellfish allergy"]);
  });
});

describe("staff bookings list repository and service integration (MH-05)", () => {
  let lateSlot;
  let lunchSlot;
  let booked;
  let cancelled;
  let byStaff;

  before(async () => {
    mock.method(confirmationEmailService, "sendBookingConfirmation", async () => false);
    //23:30 UTC on 9 March 2093 is 00:30 on 10 March in Rome (winter time, UTC+1)
    lateSlot = await createSlot("2093-03-09T23:30:00Z", "2093-03-10T00:30:00Z", { 1: 4, 2: 4 });
    lunchSlot = await createSlot("2093-03-10T12:00:00+01:00", "2093-03-10T13:00:00+01:00", { 1: 6 });

    booked = await reservationService.createReservation(hiker.id, lateSlot, 6, STORY_REQUIREMENTS());
    cancelled = await reservationService.createReservation(hiker.id, lunchSlot, 2, []);
    await pool.query("UPDATE reservation SET status = 'cancelled', cancelled_at = now(), cancelled_by = $1 WHERE id = $2", [employee.id, cancelled.id]);

    //A booking entered by staff for a temporary hiker (MH-07), inserted directly
    const { rows: [temporary] } = await pool.query(
      "INSERT INTO app_user (first_name, last_name, phone, is_temporary, role) VALUES ('Luca', $1, '3471112233', true, 'hiker') RETURNING id",
      [TEMPORARY_LAST_NAME],
    );
    const { rows: [reservation] } = await pool.query(
      "INSERT INTO reservation (hiker_id, slot_id, party_size, created_by) VALUES ($1, $2, 1, $3) RETURNING id",
      [temporary.id, lunchSlot, employee.id],
    );
    byStaff = reservation.id;
    mock.reset();
  });

  // Uses PostgreSQL to verify the date filter uses the hut's day, not the UTC day.
  it("lists a slot that starts just after midnight in Rome under the Rome date", async () => {
    const romeDay = await reservationService.getStaffReservations({ date: "2093-03-10" });
    const utcDay = await reservationService.getStaffReservations({ date: "2093-03-09" });

    assert.deepEqual(romeDay.map((booking) => booking.id), [booked.id, cancelled.id, byStaff]);
    assert.equal(utcDay.some((booking) => booking.id === booked.id), false);
  });

  // Uses PostgreSQL to verify one booking is read with every documented field, requirements with allergies first.
  it("returns the booking with its hiker, tables and requirements, allergies first", async () => {
    const [booking] = await reservationService.getStaffReservations({ slotId: lateSlot });

    assert.equal(booking.id, booked.id);
    assert.deepEqual(booking.slot, { id: lateSlot, startAt: new Date("2093-03-09T23:30:00Z"), endAt: new Date("2093-03-10T00:30:00Z") });
    assert.equal(booking.partySize, 6);
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.hasAllergies, true);
    assert.deepEqual(booking.requirements.map((requirement) => [requirement.hasAllergies, requirement.description]), [
      [true, "Vegan, peanut allergy"],
      [true, "Shellfish allergy"],
      [false, "Vegetarians"],
    ]);
    assert.equal(booking.tables.reduce((total, table) => total + table.seats, 0), 6);
    assert.deepEqual(booking.hiker, {
      id: hiker.id,
      email: hiker.email,
      firstName: "Ada",
      lastName: "Lovelace",
      phone: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      notes: null,
      isTemporary: false,
    });
    assert.equal(booking.createdBy, null);
    assert.equal(booking.cancelledBy, null);
  });

  // Uses PostgreSQL to verify the status filter, who cancelled, who entered the booking and a temporary hiker without email.
  it("filters by status and shows who cancelled or entered each booking", async () => {
    const confirmed = await reservationService.getStaffReservations({ slotId: lunchSlot, status: "confirmed" });
    const [cancelledBooking] = await reservationService.getStaffReservations({ slotId: lunchSlot, status: "cancelled" });

    assert.deepEqual(confirmed.map((booking) => booking.id), [byStaff]);
    assert.deepEqual(confirmed[0].createdBy, { id: employee.id, firstName: "Giulia", lastName: "Bianchi", role: "employee" });
    assert.equal(confirmed[0].hiker.email, null);
    assert.equal(confirmed[0].hiker.isTemporary, true);
    assert.equal(confirmed[0].hasAllergies, false);
    assert.deepEqual(confirmed[0].requirements, []);

    assert.equal(cancelledBooking.id, cancelled.id);
    assert.ok(cancelledBooking.cancelledAt instanceof Date);
    assert.deepEqual(cancelledBooking.cancelledBy, { id: employee.id, firstName: "Giulia", lastName: "Bianchi", role: "employee" });
  });

  // Uses PostgreSQL to verify the list is ordered by slot start, then by booking date.
  it("orders the bookings by slot start, then by booking date", async () => {
    const bookings = await reservationService.getStaffReservations({ date: "2093-03-10" });

    const keys = bookings.map((booking) => [booking.slot.startAt.getTime(), booking.createdAt.getTime()]);
    const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    assert.deepEqual(keys, sorted);
    assert.equal(bookings[0].id, booked.id);
  });

  // Uses PostgreSQL to verify a filter that matches nothing returns an empty list.
  it("returns an empty list when nothing matches", async () => {
    assert.deepEqual(await reservationService.getStaffReservations({ slotId: lateSlot, status: "cancelled" }), []);
  });
});
