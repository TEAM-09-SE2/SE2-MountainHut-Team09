import * as mockApi from "./slotsApi.mock";
import * as realApi from "./slotsApi";

//Mock data only if explicitly asked (VITE_USE_MOCK=true), otherwise the real backend
const api = import.meta.env.VITE_USE_MOCK === "true" ? mockApi : realApi;

export const { getSlotsByDate, getSlot, createSlot } = api;
