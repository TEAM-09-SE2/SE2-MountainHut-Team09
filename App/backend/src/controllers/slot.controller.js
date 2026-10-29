import slotRepository from "../database/slot.repository.js";
import { ErrorClass } from "../errors/ErrorClass.js";

//YYYY-MM-DD and a real calendar day (rejects 2026-02-30)
function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

async function getSlotsByDate(req, res) {
  const { date } = req.query;
  if (!isValidDate(date)) throw new ErrorClass("date is required, format YYYY-MM-DD.", 400, "INVALID_DATE");
  res.json(await slotRepository.findSlotsByDate(date));
}

export default { getSlotsByDate };
