import * as mockApi from "./slotsApi.mock";
import * as realApi from "./slotsApi";

const api = import.meta.env.VITE_USE_MOCK === "false" ? realApi : mockApi;

export const { getSlotsByDate, getSlot, createSlot } = api;
