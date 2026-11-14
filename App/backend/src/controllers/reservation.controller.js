import { BadRequestError } from "../errors/ErrorClass.js";
import reservationService from "../services/reservation.service.js";

const MAX_POSTGRES_INTEGER = 2147483647;
const isPositivePostgresInteger = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_POSTGRES_INTEGER;

// Validate and normalize optional party requirements before creating a reservation.
function validateRequirements(requirements, partySize) {
  if (requirements === undefined) return [];
  if (!Array.isArray(requirements)) {
    throw new BadRequestError(
      "requirements must be a list.",
      "INVALID_INPUT",
    );
  }

  let totalPeople = 0;
  const normalizedRequirements = requirements.map((requirement) => {
    if (
      !requirement ||
      typeof requirement !== "object" ||
      Array.isArray(requirement) ||
      !Number.isInteger(requirement.peopleCount) ||
      requirement.peopleCount < 1 ||
      requirement.peopleCount > MAX_POSTGRES_INTEGER ||
      typeof requirement.hasAllergies !== "boolean" ||
      typeof requirement.description !== "string"
    ) {
      throw new BadRequestError(
        "Each requirement must have a positive peopleCount, a hasAllergies boolean, and a description.",
        "INVALID_INPUT",
      );
    }

    const description = requirement.description.trim();
    if (!description || description.length > 500) {
      throw new BadRequestError(
        "Requirement descriptions must contain 1 to 500 characters after trimming.",
        "INVALID_INPUT",
      );
    }

    totalPeople += requirement.peopleCount;
    return {
      peopleCount: requirement.peopleCount,
      hasAllergies: requirement.hasAllergies,
      description,
    };
  });

  if (totalPeople > partySize) {
    throw new BadRequestError(
      "The total peopleCount in requirements cannot exceed partySize.",
      "INVALID_INPUT",
    );
  }

  return normalizedRequirements;
}

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
      typeof slotId === "string" && /^\d+$/.test(slotId)
        ? Number(slotId)
        : NaN;
    if (
      !Number.isInteger(numericSlotId) ||
      numericSlotId < 1 ||
      numericSlotId > MAX_POSTGRES_INTEGER
    ) {
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

export default { getStaffReservations, createReservation };
