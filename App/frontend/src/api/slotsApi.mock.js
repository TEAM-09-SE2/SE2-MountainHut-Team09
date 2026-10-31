// Fake MH-02 slot APIs: same signatures and response shapes as documentation/api.md.
import { ApiError } from "./ApiError";

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

let nextSlotId = 4;
let nextTableId = 100;

const slots = [
  {
    id: 1,
    startAt: "2026-11-01T12:00:00+01:00",
    endAt: "2026-11-01T13:00:00+01:00",
    tables: [
      { id: 1, tableNumber: 1, seats: 4 },
      { id: 2, tableNumber: 2, seats: 4 },
      { id: 3, tableNumber: 3, seats: 6 },
      { id: 4, tableNumber: 4, seats: 8 },
    ],
  },
  {
    id: 2,
    startAt: "2026-11-01T13:00:00+01:00",
    endAt: "2026-11-01T14:00:00+01:00",
    tables: [
      { id: 5, tableNumber: 1, seats: 4 },
      { id: 6, tableNumber: 2, seats: 6 },
    ],
  },
  {
    id: 3,
    startAt: "2026-11-01T19:00:00+01:00",
    endAt: "2026-11-01T20:30:00+01:00",
    tables: [
      { id: 7, tableNumber: 1, seats: 4 },
      { id: 8, tableNumber: 2, seats: 4 },
      { id: 9, tableNumber: 3, seats: 6 },
      { id: 10, tableNumber: 4, seats: 6 },
      { id: 11, tableNumber: 5, seats: 8 },
    ],
  },
];

const sumSeats = (slot) => slot.tables.reduce((sum, t) => sum + t.seats, 0);
const localDate = (iso) => new Date(iso).toLocaleDateString("sv-SE"); // YYYY-MM-DD

// GET /api/v1/slots?date=YYYY-MM-DD
export async function getSlotsByDate(date) {
  await delay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))
    throw new ApiError(400, "INVALID_DATE", "Invalid date");
  return slots
    .filter((s) => localDate(s.startAt) === date)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .map((s) => ({
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      totalSeats: sumSeats(s),
      freeSeats: sumSeats(s),
      bookable: new Date(s.startAt) - Date.now() > 2 * 60 * 60 * 1000,
    }));
}

// GET /api/v1/slots/:id
export async function getSlot(id) {
  await delay();
  const slot = slots.find((s) => s.id === Number(id));
  if (!slot) throw new ApiError(404, "SLOT_NOT_FOUND", "Slot not found");
  return {
    ...slot,
    totalSeats: sumSeats(slot),
    tables: slot.tables.map((t) => ({ ...t, freeSeats: t.seats })),
  };
}

// POST /api/v1/slots
export async function createSlot({
  startAt,
  endAt,
  tables,
  copyTablesFromSlotId,
}) {
  await delay();
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (isNaN(start) || isNaN(end) || end <= start) {
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "End time must be after start time",
    );
  }
  if ((tables === undefined) === (copyTablesFromSlotId === undefined)) {
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Provide exactly one of tables and copyTablesFromSlotId",
    );
  }

  let newTables = tables;
  if (copyTablesFromSlotId !== undefined) {
    const source = slots.find((s) => s.id === copyTablesFromSlotId);
    if (!source)
      throw new ApiError(404, "SLOT_NOT_FOUND", "Slot to copy from not found");
    newTables = source.tables;
  } else {
    const numbers = tables.map((t) => t.tableNumber);
    if (
      tables.length === 0 ||
      tables.some((t) => !Number.isInteger(t.seats) || t.seats < 1) ||
      new Set(numbers).size !== numbers.length
    ) {
      throw new ApiError(400, "INVALID_INPUT", "Invalid table list");
    }
  }

  const slot = {
    id: nextSlotId++,
    startAt,
    endAt,
    tables: newTables.map(({ tableNumber, seats }) => ({
      id: nextTableId++,
      tableNumber,
      seats,
    })),
  };
  slots.push(slot);
  return { ...slot, totalSeats: sumSeats(slot) };
}
