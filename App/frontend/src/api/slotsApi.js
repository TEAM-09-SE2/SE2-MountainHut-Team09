import { ApiError } from "./ApiError";

//Same backend address as the MH-01 client (reservationApi.js): Vite has no proxy
const API_BASE_URL = "http://localhost:4000/api/v1";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include", // JWT is stored in the "token" cookie
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      body?.error,
      body?.message ?? "Request failed",
    );
  return body;
}

export const getSlotsByDate = (date) => request(`/slots?date=${date}`);
export const getSlot = (id) => request(`/slots/${id}`);
export const createSlot = (payload) =>
  request("/slots", { method: "POST", body: JSON.stringify(payload) });
