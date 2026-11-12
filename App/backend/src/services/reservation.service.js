import pool from "../database/connection.js";
import reservationRepository from "../database/reservation.repository.js";
import slotRepository from "../database/slot.repository.js";
import {
  BadRequestError,
  ConflictError,
  ErrorClass,
  NotFoundError,
} from "../errors/ErrorClass.js";
import tableAssignmentService from "./tableAssignment.service.js";
import confirmationEmailService from "./confirmationEmail.service.js";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

//Book a table: checks and inserts run in one transaction, with the slot row locked
async function createReservation(hikerId, slotId, partySize) {
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

    await client.query("COMMIT");

    //Not returned here: the email is sent below, after the connection is released
    reservation = {
      id,
      slotId,
      startAt: slot.start_at,
      partySize,
      status: "confirmed",
      tables: tables.map(({ tableNumber, seats }) => ({ tableNumber, seats })),
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

//List the hiker's current and upcoming bookings with the changeable flag (MH-06)
async function getMyReservations(hikerId) {
  return reservationRepository.getUpcomingBookingsByHikerId(hikerId);
}

//Change slot, party size and/or requirements of an existing booking (MH-06)
async function changeBooking(
  hikerId,
  reservationId,
  { slotId, partySize, requirements } = {},
) {
  const client = await pool.connect();
  let updatedBooking;

  try {
    await client.query("BEGIN");

    //Lock the booking first; returns undefined if owned by another hiker so we answer 404
    const booking = await reservationRepository.getBookingForUpdate(
      client,
      reservationId,
      hikerId,
    );
    if (!booking)
      throw new NotFoundError(
        "The reservation does not exist.",
        "RESERVATION_NOT_FOUND",
      );

    //Case: cancelled bookings cannot be changed
    if (booking.status === "cancelled")
      throw new ConflictError(
        "Cancelled bookings cannot be changed.",
        "BOOKING_CANCELLED",
      );

    //Case: changes close 48 hours before the start of the current slot
    const now = Date.now();
    const currentSlotStart = new Date(booking.current_slot_start).getTime();
    if (currentSlotStart - now <= FORTY_EIGHT_HOURS_MS)
      throw new ErrorClass(
        "Changes close 48 hours before the slot starts.",
        422,
        "CHANGE_CLOSED",
      );

    const targetSlotId = slotId ?? booking.slot_id;
    const targetPartySize = partySize ?? booking.party_size;
    const isSlotChanged = targetSlotId !== booking.slot_id;
    const isPartySizeChanged = targetPartySize !== booking.party_size;

    //Fetch existing requirements; if omitted in payload, the existing ones stay
    const existingRequirements =
      await reservationRepository.getReservationRequirements(
        client,
        reservationId,
      );
    const effectiveRequirements = requirements ?? existingRequirements;

    //Case: total people in requirements cannot exceed the new party size (MH-05/06)
    const totalReqPeople = effectiveRequirements.reduce(
      (sum, r) => sum + (r.peopleCount || 0),
      0,
    );
    if (totalReqPeople > targetPartySize) {
      throw new BadRequestError(
        "Total people in requirements cannot exceed party size.",
        "INVALID_REQUIREMENTS",
      );
    }

    //Lock involved slots in ascending id order so concurrent changes never deadlock
    const slotIdsToLock = [...new Set([booking.slot_id, targetSlotId])].sort(
      (a, b) => a - b,
    );
    const lockedSlots = await reservationRepository.lockSlotsInOrder(
      client,
      slotIdsToLock,
    );
    const targetSlot = lockedSlots.find((s) => s.id === targetSlotId);

    if (isSlotChanged) {
      //Case: the target slot does not exist
      if (!targetSlot)
        throw new NotFoundError("The slot does not exist.", "SLOT_NOT_FOUND");

      //Case: the target slot must still be bookable (at least 2 hours before start, per MH-01)
      const isBookable =
        targetSlot.bookable !== undefined
          ? targetSlot.bookable
          : new Date(targetSlot.start_at).getTime() - now > TWO_HOURS_MS;
      if (!isBookable)
        throw new ErrorClass(
          "Bookings close 2 hours before the slot starts.",
          422,
          "BOOKING_CLOSED",
        );

      //Case: the hiker already has another confirmed booking in the target slot
      if (
        await reservationRepository.hasConfirmedReservation(
          client,
          hikerId,
          targetSlotId,
        )
      ) {
        throw new ConflictError(
          "You already have a booking for this slot.",
          "ALREADY_BOOKED",
        );
      }
    }

    //Apply the 5 table reassignment rules
    if (isSlotChanged) {
      //Rule 1: slot changed -> release current seats, update slot_id, assign new tables (MH-01)
      const freeTables = await slotRepository.findFreeTablesBySlotId(
        client,
        targetSlotId,
      );
      const tables = tableAssignmentService.assignTables(
        freeTables,
        targetPartySize,
      );
      if (!tables)
        throw new ConflictError(
          "Not enough free seats in this slot.",
          "NOT_ENOUGH_SEATS",
        );

      //Delete seats before updating slot_id because of the composite FK (reservation_id, slot_id)
      await reservationRepository.deleteReservationSeats(client, reservationId);
      await reservationRepository.updateReservation(
        client,
        reservationId,
        targetSlotId,
        targetPartySize,
      );
      await reservationRepository.insertReservationSeats(
        client,
        reservationId,
        targetSlotId,
        tables,
      );
    } else if (isPartySizeChanged && targetPartySize > booking.party_size) {
      const extraSeatsNeeded = targetPartySize - booking.party_size;
      const currentTables =
        await reservationRepository.getBookingSeatsWithAvailability(
          client,
          reservationId,
          targetSlotId,
        );
      const totalFreeAtCurrentTables = currentTables.reduce(
        (sum, t) => sum + t.freeSeats,
        0,
      );

      if (totalFreeAtCurrentTables >= extraSeatsNeeded) {
        //Rule 2: party size up, fits at current tables -> add seats from table with most free seats
        currentTables.sort((a, b) => b.freeSeats - a.freeSeats);

        let remaining = extraSeatsNeeded;
        for (const table of currentTables) {
          if (remaining === 0) break;
          const add = Math.min(remaining, table.freeSeats);
          if (add > 0) {
            await reservationRepository.updateReservationSeatCount(
              client,
              reservationId,
              table.slotTableId,
              table.bookedSeats + add,
            );
            remaining -= add;
          }
        }
        await reservationRepository.updateReservation(
          client,
          reservationId,
          targetSlotId,
          targetPartySize,
        );
      } else {
        //Rule 3: party size up, does not fit -> release current seats and reassign from scratch
        await reservationRepository.deleteReservationSeats(
          client,
          reservationId,
        );
        const freeTables = await slotRepository.findFreeTablesBySlotId(
          client,
          targetSlotId,
        );
        const tables = tableAssignmentService.assignTables(
          freeTables,
          targetPartySize,
        );
        if (!tables)
          throw new ConflictError(
            "Not enough free seats in this slot.",
            "NOT_ENOUGH_SEATS",
          );

        await reservationRepository.updateReservation(
          client,
          reservationId,
          targetSlotId,
          targetPartySize,
        );
        await reservationRepository.insertReservationSeats(
          client,
          reservationId,
          targetSlotId,
          tables,
        );
      }
    } else if (isPartySizeChanged && targetPartySize < booking.party_size) {
      //Rule 4: party size down -> remove seats from table with fewest booked seats; release empty tables
      const seatsToRemove = booking.party_size - targetPartySize;
      const currentTables =
        await reservationRepository.getBookingSeatsWithAvailability(
          client,
          reservationId,
          targetSlotId,
        );
      currentTables.sort((a, b) => a.bookedSeats - b.bookedSeats);

      let remaining = seatsToRemove;
      for (const table of currentTables) {
        if (remaining === 0) break;
        const remove = Math.min(remaining, table.bookedSeats);
        const newSeats = table.bookedSeats - remove;

        if (newSeats === 0) {
          await reservationRepository.deleteSingleReservationSeat(
            client,
            reservationId,
            table.slotTableId,
          );
        } else {
          await reservationRepository.updateReservationSeatCount(
            client,
            reservationId,
            table.slotTableId,
            newSeats,
          );
        }
        remaining -= remove;
      }

      await reservationRepository.updateReservation(
        client,
        reservationId,
        targetSlotId,
        targetPartySize,
      );
    } else {
      //Rule 5: only requirements changed -> keep seats and update updated_at
      await reservationRepository.updateReservation(
        client,
        reservationId,
        targetSlotId,
        targetPartySize,
      );
    }

    //Replace requirements if a new list was provided
    let finalRequirements = existingRequirements;
    if (requirements !== undefined) {
      await reservationRepository.deleteReservationRequirements(
        client,
        reservationId,
      );
      await reservationRepository.insertReservationRequirements(
        client,
        reservationId,
        requirements,
      );
      finalRequirements = await reservationRepository.getReservationRequirements(
        client,
        reservationId,
      );
    }

    await client.query("COMMIT");

    updatedBooking = {
      id: reservationId,
      slotId: targetSlotId,
      startAt: targetSlot.start_at,
      partySize: targetPartySize,
      status: booking.status,
      requirements: finalRequirements,
    };
  } catch (error) {
    //Any error undoes the whole change, leaving the original booking intact
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  //The email is sent only after the commit, and the change stays valid if it fails
  const confirmationSent = confirmationEmailService.sendBookingUpdate
    ? await confirmationEmailService.sendBookingUpdate(reservationId)
    : false;
  return { ...updatedBooking, confirmationSent };
}

export default { createReservation, getMyReservations, changeBooking };