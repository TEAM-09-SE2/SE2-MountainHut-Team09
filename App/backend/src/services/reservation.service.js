import pool from "../database/connection.js";
import reservationRepository from "../database/reservation.repository.js";
import slotRepository from "../database/slot.repository.js";
import { ErrorClass } from "../errors/ErrorClass.js";
import tableAssignmentService from "./tableAssignment.service.js";

//Book a table: checks and inserts run in one transaction, with the slot row locked
async function createReservation(hikerId, slotId, partySize) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const slot = await slotRepository.lockSlotById(client, slotId);
    if (!slot) throw new ErrorClass("The slot does not exist.", 404, "SLOT_NOT_FOUND");
    if (!slot.bookable) throw new ErrorClass("Bookings close 2 hours before the slot starts.", 422, "BOOKING_CLOSED");
    if (await reservationRepository.hasConfirmedReservation(client, hikerId, slotId)) {
      throw new ErrorClass("You already have a booking for this slot.", 409, "ALREADY_BOOKED");
    }

    const freeTables = await slotRepository.findFreeTablesBySlotId(client, slotId);
    const tables = tableAssignmentService.assignTables(freeTables, partySize);
    if (!tables) throw new ErrorClass("Not enough free seats in this slot.", 409, "NOT_ENOUGH_SEATS");

    const id = await reservationRepository.insertReservation(client, hikerId, slotId, partySize);
    await reservationRepository.insertReservationSeats(client, id, slotId, tables);

    await client.query("COMMIT");

    return {
      id,
      slotId,
      startAt: slot.start_at,
      partySize,
      status: "confirmed",
      tables: tables.map(({ tableNumber, seats }) => ({ tableNumber, seats })),
      confirmationSent: false, // TODO MH-03: send the confirmation email after the commit
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default { createReservation };
