import availabilityRepository from "../database/availability.repository.js";

//Book constraint
const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;


//Function used in checkAvailability for generating a possible allocation of the party
function createAllocation(tables, partySize) {
    let seatsToAssign = partySize;
    const allocation = [];

    const tablesByCapacity = [...tables].sort(
        // Prefer tables with more free seats; break ties by table number.
        (first, second) =>
            Number(second.free_seats) - Number(first.free_seats)
            || Number(first.table_number) - Number(second.table_number),
    );

    for (const table of tablesByCapacity) {
        if (seatsToAssign === 0) break;

        const seats = Math.min(Number(table.free_seats), seatsToAssign);
        if (seats > 0) {
            allocation.push({ tableNumber: Number(table.table_number), seats });
            seatsToAssign -= seats;
        }
    }

    return seatsToAssign === 0 ? allocation.sort((first, second) => first.tableNumber - second.tableNumber) : null;
}

//Function that check the availability of seats given a date, time and party size
async function checkAvailability(date, time, partySize) {
    const slot = await availabilityRepository.findSlotByDateAndTime(date, time);
    const response = { available: false };

    //Case: no slot available
    if (!slot) {
        return { ...response, reason: "NO_SLOT", slot: null, freeSeats: null, allocation: null };
    }

    const tables = await availabilityRepository.findTablesBySlotId(slot.id);
    const slotDetails = { id: Number(slot.id), startAt: slot.start_at.toISOString(), endAt: slot.end_at.toISOString() };
    const freeSeats = tables.reduce((total, table) => total + Number(table.free_seats), 0);
    const bookingClosed = new Date(slot.start_at).getTime() - Date.now() < TWO_HOURS_IN_MS;

    //Case: the booking is closed
    if (bookingClosed) {
        return { ...response, reason: "BOOKING_CLOSED", slot: slotDetails, freeSeats, allocation: null };
    }

    //Case: the free seats are not enough
    if (freeSeats < partySize) {
        return { ...response, reason: "NOT_ENOUGH_SEATS", slot: slotDetails, freeSeats, allocation: null };
    }

    const allocation = createAllocation(tables, partySize);
    return { ...response, available: true, slot: slotDetails, freeSeats, allocation };
}

export default { checkAvailability };