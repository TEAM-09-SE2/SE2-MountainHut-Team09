import pool from "../database/connection.js";
import reservationRepository from "../database/reservation.repository.js";
import slotRepository from "../database/slot.repository.js";
import {
  ConflictError,
  ErrorClass,
  NotFoundError,
} from "../errors/ErrorClass.js";
import tableAssignmentService from "./tableAssignment.service.js";
import confirmationEmailService from "./confirmationEmail.service.js";

//Book a table: checks and inserts run in one transaction, with the slot row locked
async function createReservation(hikerId, slotId, partySize, requirements) {
  const client = await pool.connect();
  let reservation;
  try {
    await client.query("BEGIN");

    //Locking the slot first makes a second booking for the same slot wait here until we commit,
    //so it reads the seats we have just taken instead of the old ones
    const slot = await slotRepository.lockSlotById(client, slotId);

    //Case: the slot does not exist
    if (!slot)
      throw new NotFoundError("The slot does not exist.", "SLOT_NOT_FOUND");

    //Case: less than 2 hours before the start, or the slot is already over
    //No subclass for 422 in ErrorClass.js yet
    if (!slot.bookable)
      throw new ErrorClass(
        "Bookings close 2 hours before the slot starts.",
        422,
        "BOOKING_CLOSED",
      );

    //Case: only one booking per hiker in the same slot (MH-01 clarification), more people go through MH-06
    if (
      await reservationRepository.hasConfirmedReservation(
        client,
        hikerId,
        slotId,
      )
    ) {
      throw new ConflictError(
        "You already have a booking for this slot.",
        "ALREADY_BOOKED",
      );
    }

    //Case: the free seats of the slot, over all its tables, are not enough for the party
    const freeTables = await slotRepository.findFreeTablesBySlotId(
      client,
      slotId,
    );
    const tables = tableAssignmentService.assignTables(freeTables, partySize);
    if (!tables)
      throw new ConflictError(
        "Not enough free seats in this slot.",
        "NOT_ENOUGH_SEATS",
      );

    //The system confirms the booking right away: status is 'confirmed' by default in the DB
    const id = await reservationRepository.insertReservation(
      client,
      hikerId,
      slotId,
      partySize,
    );
    await reservationRepository.insertReservationSeats(
      client,
      id,
      slotId,
      tables,
    );
    const savedRequirements =
      await reservationRepository.insertReservationRequirements(
        client,
        id,
        requirements,
      );

    await client.query("COMMIT");

    //Not returned here: the email is sent below, after the connection is released
    reservation = {
      id,
      slotId,
      startAt: slot.start_at,
      partySize,
      status: "confirmed",
      tables: tables.map(({ tableNumber, seats }) => ({ tableNumber, seats })),
      requirements: savedRequirements,
    };
  } catch (error) {
    //Any error undoes the whole booking, so we never keep a reservation without its seats
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  //The email is sent only after the commit, and the booking stays valid if it fails
  const confirmationSent =
    await confirmationEmailService.sendBookingConfirmation(reservation.id);
  return { ...reservation, confirmationSent };
}

//Return the reservations that match the conditions (only for employees and warden)
async function getStaffReservations(filters) {
  return reservationRepository.getStaffReservations(filters);
}

export default { createReservation, getStaffReservations };
