const API_BASE_URL = "http://localhost:4000/api/v1";

const handleResponse = async (response) => {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || "An unexpected error occurred.");
    error.status = response.status;
    error.code = data?.error || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
};

/**
 * MH-04: public, no login needed.
 * @param {string} date - YYYY-MM-DD
 * @param {string} time - HH:mm, hut local time
 * @param {number} partySize - number of people (>= 1)
 */
export const checkAvailability = async (date, time, partySize) => {
  const params = new URLSearchParams({ date, time, partySize: String(partySize) });
  const response = await fetch(`${API_BASE_URL}/availability?${params}`, {
    method: "GET",
  });
  return handleResponse(response);
};
