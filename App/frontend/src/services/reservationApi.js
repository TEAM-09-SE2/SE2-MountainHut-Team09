import { API_ORIGIN } from "../api/apiOrigin";

const API_BASE_URL = `${API_ORIGIN}/api/v1`;

const handleResponse = async (response) => {
  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || "An unexpected error occurred.",
    );
    error.status = response.status;
    error.code = data?.error || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
};

/**
 * Slots for a specific date (YYYY-MM-DD).
 * @param {string} date
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
 * Creates a new reservation for the logged-in hiker (MH-01 / MH-05).
 * @param {number} slotId - Slot ID
 * @param {number} partySize - Number of guests (>= 1)
 * @param {Array} requirements - Party requirements (empty when none are specified)
 */
export const createReservation = async (slotId, partySize, requirements = []) => {
  const response = await fetch(`${API_BASE_URL}/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      slotId: Number(slotId),
      partySize: Number(partySize),
      requirements,
    }),
  });
  return handleResponse(response);
};

/**
 * MH-05: bookings for the staff, with hiker, tables and requirements.
 * Empty filters are left out, so the API applies only the ones that were chosen.
 * @param {{date?: string, slotId?: number|string, status?: "confirmed"|"cancelled"}} filters
 */
export const fetchStaffReservations = async (filters = {}) => {
  const params = new URLSearchParams();
  for (const name of ["date", "slotId", "status"]) {
    if (filters[name] !== undefined && filters[name] !== null && filters[name] !== "") {
      params.set(name, String(filters[name]));
    }
  }
  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/reservations${query ? `?${query}` : ""}`, {
    method: "GET",
    credentials: "include",
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
 * @param {number} id - Booking ID
 * @param {{ slotId?: number, partySize?: number, requirements?: Array }} changes
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

/**
 * MH-07: searches registered and temporary hikers by name, phone, or email (min 2 chars).
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options]
 */
export const searchHikers = async (query, { signal } = {}) => {
  const normalizedQuery = String(query ?? "").trim();
  const response = await fetch(
    `${API_BASE_URL}/staff/hikers?q=${encodeURIComponent(normalizedQuery)}`,
    {
      method: "GET",
      credentials: "include",
      signal,
    },
  );
  return handleResponse(response);
};

/**
 * MH-07: creates a reservation on behalf of an existing, new full, or temporary hiker.
 * @param {{
 *   slotId: number,
 *   partySize: number,
 *   requirements?: Array,
 *   hikerId?: number,
 *   newHiker?: Object,
 *   temporaryHiker?: Object
 * }} payload
 */
export const createStaffReservation = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/staff/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

/**
 * MH-08: the logged-in hiker cancels one of their own bookings.
 * Returns the cancelled booking; `confirmationSent` tells whether the "booking cancelled" email was sent.
 * @param {number} id - booking ID
 */
export const cancelReservation = async (id) => {
  const response = await fetch(`${API_BASE_URL}/reservations/${Number(id)}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse(response);
};
