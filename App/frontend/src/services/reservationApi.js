const API_BASE_URL = "http://localhost:4000/api/v1";

const handleResponse = async (response) => {
  if (response.status === 204) return null;
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.message || "Si è verificato un errore durante la richiesta.",
    );
    error.status = response.status;
    error.code = data.error || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
};

/**
 * Slot for a specific date (YYYY-MM-DD).
 */
export const fetchSlotsByDate = async (date) => {
  const response = await fetch(
    `${API_BASE_URL}/slots?date=${encodeURIComponent(date)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );
  return handleResponse(response);
};

/**
 * Creating a new reservation
 * @param {number} slotId - ID
 * @param {number} partySize - Number of guests (>= 1)
 */
export const createReservation = async (slotId, partySize) => {
  const response = await fetch(`${API_BASE_URL}/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      slotId: Number(slotId),
      partySize: Number(partySize),
    }),
  });
  return handleResponse(response);
};

/**
 * MH-06: the logged-in hiker's current and upcoming bookings (confirmed and cancelled).
 */
export const fetchMyReservations = async () => {
  const response = await fetch(`${API_BASE_URL}/me/reservations`, {
    method: "GET",
    credentials: "include",
  });
  return handleResponse(response);
};

/**
 * MH-06: changes slot, party size and/or requirements of an own booking.
 * Only the fields present in `changes` are sent; the missing ones stay as they are.
 * @param {number} id - booking ID
 * @param {{slotId?: number, partySize?: number, requirements?: Array}} changes
 */
export const changeReservation = async (id, changes) => {
  const response = await fetch(`${API_BASE_URL}/reservations/${Number(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(changes),
  });
  return handleResponse(response);
};
