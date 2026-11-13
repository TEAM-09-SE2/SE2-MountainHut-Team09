import { BadRequestError } from "../errors/ErrorClass.js";
import reservationService from "../services/reservation.service.js";

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

async function createReservation(req, res) {
  const { slotId, partySize, requirements } = req.body ?? {};

  if (!isPositiveInteger(slotId) || !isPositiveInteger(partySize)) {
    throw new BadRequestError(
      "slotId and partySize must be integers greater than 0.",
      "INVALID_INPUT",
    );
  }

  if (requirements !== undefined) {
    if (!Array.isArray(requirements)) {
      throw new BadRequestError(
        "requirements must be an array.",
        "INVALID_INPUT",
      );
    }
    for (const item of requirements) {
      if (
        !item ||
        !isPositiveInteger(item.peopleCount) ||
        typeof item.hasAllergies !== "boolean" ||
        typeof item.description !== "string" ||
        item.description.trim().length === 0 ||
        item.description.trim().length > 500
      ) {
        throw new BadRequestError(
          "Each requirement must have a positive integer peopleCount, a boolean hasAllergies, and a non-empty description up to 500 characters.",
          "INVALID_INPUT",
        );
      }
    }
  }

  const reservation = await reservationService.createReservation(
    req.user.id,
    slotId,
    partySize,
    requirements,
  );
  res.status(201).json(reservation);
}

//List the hiker's current and upcoming bookings with the changeable flag (MH-06)
async function getMyReservations(req, res) {
  const reservations = await reservationService.getMyReservations(req.user.id);
  // Returns the array directly, per API contract
  res.status(200).json(reservations);
}

//Change slot, party size and/or requirements of an existing booking (MH-06)
async function changeBooking(req, res) {
  const reservationId = Number(req.params.id);
  if (!isPositiveInteger(reservationId)) {
    throw new BadRequestError(
      "Reservation id must be an integer greater than 0.",
      "INVALID_INPUT",
    );
  }

  const { slotId, partySize, requirements } = req.body ?? {};
  if (
    slotId === undefined &&
    partySize === undefined &&
    requirements === undefined
  ) {
    throw new BadRequestError(
      "At least one of slotId, partySize, or requirements must be provided.",
      "INVALID_INPUT",
    );
  }

  if (slotId !== undefined && !isPositiveInteger(slotId)) {
    throw new BadRequestError(
      "slotId must be an integer greater than 0.",
      "INVALID_INPUT",
    );
  }

  if (partySize !== undefined && !isPositiveInteger(partySize)) {
    throw new BadRequestError(
      "partySize must be an integer greater than 0.",
      "INVALID_INPUT",
    );
  }

  if (requirements !== undefined) {
    if (!Array.isArray(requirements)) {
      throw new BadRequestError(
        "requirements must be an array.",
        "INVALID_INPUT",
      );
    }
    for (const item of requirements) {
      if (
        !item ||
        !isPositiveInteger(item.peopleCount) ||
        typeof item.hasAllergies !== "boolean" ||
        typeof item.description !== "string" ||
        item.description.trim().length === 0 ||
        item.description.trim().length > 500
      ) {
        throw new BadRequestError(
          "Each requirement must have a positive integer peopleCount, a boolean hasAllergies, and a non-empty description up to 500 characters.",
          "INVALID_INPUT",
        );
      }
    }
  }

  const reservation = await reservationService.changeBooking(
    req.user.id,
    reservationId,
    { slotId, partySize, requirements },
  );
  res.status(200).json(reservation);
}

export default { createReservation, getMyReservations, changeBooking };