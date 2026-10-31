import { ApiError } from "./ApiError";

async function request(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
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
