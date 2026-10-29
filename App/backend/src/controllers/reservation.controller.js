import { BadRequestError } from "../errors/ErrorClass.js";
import reservationService from "../services/reservation.service.js";

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

async function createReservation(req, res) {
  const { slotId, partySize } = req.body ?? {};
  if (!isPositiveInteger(slotId) || !isPositiveInteger(partySize)) {
    throw new BadRequestError(
      "slotId and partySize must be integers greater than 0.",
      "INVALID_INPUT",
    );
  }
  const reservation = await reservationService.createReservation(
    req.user.id,
    slotId,
    partySize,
  );
  res.status(201).json(reservation);
}

export default { createReservation };
