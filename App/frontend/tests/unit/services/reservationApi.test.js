import {
  fetchSlotsByDate,
  createReservation,
  fetchMyReservations,
  changeReservation,
} from "../../../src/services/reservationApi";

//Fake fetch response with the given HTTP status and JSON body
const mockFetch = (status, body) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

afterEach(() => vi.restoreAllMocks());

describe("reservationApi", () => {
  it("fetchMyReservations calls GET /me/reservations with the session cookie", async () => {
    const fetchMock = mockFetch(200, [{ id: 31 }]);

    expect(await fetchMyReservations()).toEqual([{ id: 31 }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/v1/me/reservations");
    expect(options).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("changeReservation sends a PATCH with only the given changes", async () => {
    const fetchMock = mockFetch(200, { id: 31, confirmationSent: true });

    await changeReservation("31", { partySize: 3 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/v1/reservations/31");
    expect(options).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual({ partySize: 3 });
  });

  it("fetchSlotsByDate calls GET /slots with the date and the session cookie", async () => {
    const fetchMock = mockFetch(200, [{ id: 7, freeSeats: 16 }]);

    const slots = await fetchSlotsByDate("2026-11-10");

    expect(slots).toEqual([{ id: 7, freeSeats: 16 }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/v1/slots?date=2026-11-10");
    expect(options).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("createReservation sends slotId and partySize as numbers", async () => {
    const fetchMock = mockFetch(201, { id: 15, confirmationSent: true });

    const reservation = await createReservation("7", "2");

    expect(reservation.id).toBe(15);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/v1/reservations");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual({ slotId: 7, partySize: 2 });
  });

  it('reads the error code from the "error" field of the backend response', async () => {
    mockFetch(409, {
      error: "ALREADY_BOOKED",
      message: "You already have a booking for this slot.",
    });

    await expect(createReservation(7, 2)).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_BOOKED",
      message: "You already have a booking for this slot.",
    });
  });
});
