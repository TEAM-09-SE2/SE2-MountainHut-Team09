import hikersRepository from "../database/hikers.repository.js";

async function searchHikers(query) {
  return hikersRepository.searchHikers(query);
}

export default { searchHikers };
