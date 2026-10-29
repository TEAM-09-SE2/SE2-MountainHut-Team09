// Seats a party following MH-01: the whole party at the smallest table that fits it;
// if no table fits, the largest tables first (so as few tables as possible),
// and the rest at the smallest table that fits the remaining people.
// tables: [{ slotTableId, tableNumber, freeSeats }]
// Returns [{ slotTableId, tableNumber, seats }], or null when the free seats are not enough.
function assignTables(tables, partySize) {
  const available = tables
    .filter((t) => t.freeSeats > 0)
    .sort((a, b) => a.freeSeats - b.freeSeats || a.tableNumber - b.tableNumber);

  const totalFree = available.reduce((sum, t) => sum + t.freeSeats, 0);
  if (totalFree < partySize) return null;

  const result = [];
  let remaining = partySize;
  while (remaining > 0) {
    const fit = available.find((t) => t.freeSeats >= remaining);
    if (fit) {
      result.push({ slotTableId: fit.slotTableId, tableNumber: fit.tableNumber, seats: remaining });
      break;
    }
    const largest = available.pop();
    result.push({ slotTableId: largest.slotTableId, tableNumber: largest.tableNumber, seats: largest.freeSeats });
    remaining -= largest.freeSeats;
  }
  return result;
}

export default { assignTables };
