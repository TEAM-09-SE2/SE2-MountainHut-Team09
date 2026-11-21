//Seats a party following MH-01: the whole party at the smallest table that fits it;
//if no table fits, the largest tables first (so as few tables as possible),
//and the rest at the smallest table that fits the remaining people.
//Tables are shared with other parties, so we only look at free seats, not at who is already sitting there.
//Used by MH-01 (booking); MH-04 computes a hypothetical allocation separately in availability.service.js.
//Keep the allocation policies aligned; availability does not reserve seats.
//tables: [{ slotTableId, tableNumber, freeSeats }]
//Returns [{ slotTableId, tableNumber, seats }], or null when the free seats are not enough.
function assignTables(tables, partySize) {
  //Smallest tables first: find() then returns the tightest fit. Ties go to the lower table number
  const available = tables
    .filter((t) => t.freeSeats > 0)
    .sort((a, b) => a.freeSeats - b.freeSeats || a.tableNumber - b.tableNumber);

  //Checking the total first also guarantees the loop below always ends
  const totalFree = available.reduce((sum, t) => sum + t.freeSeats, 0);
  if (totalFree < partySize) return null;

  const result = [];
  let remaining = partySize;
  while (remaining > 0) {
    //On the first round this keeps the whole party together if any table is big enough
    const fit = available.find((t) => t.freeSeats >= remaining);
    if (fit) {
      result.push({
        slotTableId: fit.slotTableId,
        tableNumber: fit.tableNumber,
        seats: remaining,
      });
      break;
    }
    //Nobody fits the remaining people: fill the biggest table and try again with the rest
    const largest = available.pop();
    result.push({
      slotTableId: largest.slotTableId,
      tableNumber: largest.tableNumber,
      seats: largest.freeSeats,
    });
    remaining -= largest.freeSeats;
  }
  return result;
}

export default { assignTables };
