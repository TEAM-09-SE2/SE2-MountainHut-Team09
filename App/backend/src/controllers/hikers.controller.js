import { BadRequestError } from "../errors/ErrorClass.js";
import hikersService from "../services/hikers.service.js";

async function searchHikers(req, res) {
  const query = req.query.q;
  if (typeof query !== "string" || query.trim().length < 2) {
    throw new BadRequestError(
      "q must contain at least 2 characters.",
      "INVALID_INPUT",
    );
  }

  const hikers = await hikersService.searchHikers(query.trim());
  res.status(200).json(hikers);
}

export default { searchHikers };
