import { BadRequestError } from "../errors/ErrorClass.js";
import reservationService from "../services/staffReservations.service.js";
import {isPositivePostgresInteger, validateRequirements} from "../utils/reservationValidation.js";

// Validate a staff booking request and return the created booking.
async function createReservation(req, res) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("Request body must be an object.", "INVALID_INPUT");
  }

  const { slotId, partySize } = body;
  if (!isPositivePostgresInteger(slotId) ||!isPositivePostgresInteger(partySize)) {
    throw new BadRequestError(
      "slotId and partySize must be positive 32-bit integers.",
      "INVALID_INPUT",
    );
  }

  const hikerOptions = [];
  for (const key of ["hikerId", "newHiker", "temporaryHiker"]) {
    if (Object.hasOwn(body, key)) hikerOptions.push(key);
  }
  if (hikerOptions.length !== 1) {
    throw new BadRequestError(
      "Exactly one of hikerId, newHiker, or temporaryHiker must be provided.",
      "INVALID_INPUT",
    );
  }

  if (Object.hasOwn(body, "hikerId") && !isPositivePostgresInteger(body.hikerId)) {
    throw new BadRequestError(
      "hikerId must be a positive 32-bit integer.",
      "INVALID_INPUT",
    );
  }

  const requirements = validateRequirements(body.requirements, partySize);
  const hikerSelection = {};
  for (const key of hikerOptions) {
    hikerSelection[key] = body[key];
  }
  const reservation = await reservationService.createStaffReservation(
    req.user.id,
    {
      slotId,
      partySize,
      requirements,
      ...hikerSelection,
    },
  );
  res.status(201).json(reservation);
}

export default { createReservation };
