import { BadRequestError } from "../errors/ErrorClass.js";
import reservationService from "../services/reservation.service.js";
import {
  isPositivePostgresInteger,
  validateRequirements,
} from "../utils/reservationValidation.js";
//MH-06 checks ids and sizes with the same rule, so they also fit a PostgreSQL integer
const isPositiveInteger = isPositivePostgresInteger;

// Check that a date is both in YYYY-MM-DD format and a real calendar day.
function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value.slice(0, 4) !== "0000"
  );
}

// Validate the supported list filters and convert slotId to a database integer.
function parseReservationFilters(query) {
  const filters = {};

  if (Object.hasOwn(query, "date")) {
    if (!isValidDate(query.date)) {
      throw new BadRequestError(
        "date must be a valid calendar date in YYYY-MM-DD format.",
        "INVALID_INPUT",
      );
    }
    filters.date = query.date;
  }

  if (Object.hasOwn(query, "slotId")) {
    const { slotId } = query;
    const numericSlotId =
      typeof slotId === "string" && /^\d+$/.test(slotId) ? Number(slotId) : NaN;
    if (!isPositivePostgresInteger(numericSlotId)) {
      throw new BadRequestError(
        "slotId must be a positive integer.",
        "INVALID_INPUT",
      );
    }
    filters.slotId = numericSlotId;
  }

  if (Object.hasOwn(query, "status")) {
    if (query.status !== "confirmed" && query.status !== "cancelled") {
      throw new BadRequestError(
        "status must be either confirmed or cancelled.",
        "INVALID_INPUT",
      );
    }
    filters.status = query.status;
  }

  return filters;
}

// Return reservations visible to staff, applying any validated query filters.
async function getStaffReservations(req, res) {
  const filters = parseReservationFilters(req.query);
  const reservations = await reservationService.getStaffReservations(filters);
  res.status(200).json(reservations);
}

// Validate the hiker's booking request and return the created reservation.
async function createReservation(req, res) {
  const { slotId, partySize, requirements } = req.body ?? {};
  if (
    !isPositivePostgresInteger(slotId) ||
    !isPositivePostgresInteger(partySize)
  ) {
    throw new BadRequestError(
      "slotId and partySize must be positive 32-bit integers.",
      "INVALID_INPUT",
    );
  }
  const normalizedRequirements = validateRequirements(requirements, partySize);
  const reservation = await reservationService.createReservation(
    req.user.id,
    slotId,
    partySize,
    normalizedRequirements,
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

//Read and validate the booking id from the path (MH-08)
function parseReservationId(req) {
  const id = Number(req.params.id);
  if (!isPositiveInteger(id)) {
    throw new BadRequestError(
      "Reservation id must be an integer greater than 0.",
      "INVALID_INPUT",
    );
  }
  return id;
}

//Hiker cancels their own booking (MH-08)
async function cancelMyBooking(req, res) {
  const reservationId = parseReservationId(req);
  const booking = await reservationService.cancelBooking(
    reservationId,
    req.user.id,
  );
  res.status(200).json(booking);
}

export default {
  getStaffReservations,
  createReservation,
  getMyReservations,
  changeBooking,
  cancelMyBooking,
};
