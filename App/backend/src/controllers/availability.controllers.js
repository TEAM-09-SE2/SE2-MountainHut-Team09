
import { BadRequestError } from "../errors/ErrorClass.js";
import availabilityService from "../services/availability.service.js";

//Check the validity of the input data
function check(req) {
  const { date, time, partySize } = req.query ?? {};

  if (typeof date !== "string" || typeof time !== "string" || typeof partySize !== "string") {
    throw new BadRequestError("Date, time, and party size are required.", "INVALID_INPUT");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestError("Date must use the YYYY-MM-DD format.", "INVALID_INPUT");
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new BadRequestError("Date must be a valid calendar date.", "INVALID_INPUT");
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new BadRequestError("Time must use the HH:mm format.", "INVALID_INPUT");
  }

  const size = Number(partySize);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new BadRequestError("Party size must be a positive integer.", "INVALID_INPUT");
  }

  return { date, time, size };
}


async function checkAvailability(req, res) {
  const { date, time, size } = check(req);
  const result = await availabilityService.checkAvailability(date, time, size);

  res.json({ ...result, date, time, partySize: size });
}

export default { checkAvailability };