import {
  fetchSlotsByDate,
  createReservation,
  fetchMyReservations,
  changeReservation,
  fetchStaffReservations,
  searchHikers,
  createStaffReservation,
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
  it("searchHikers encodes the query and includes an optional AbortSignal", async () => {
    const controller = new AbortController();
    const fetchMock = mockFetch(200, [{ id: 12, firstName: "Ada", lastName: "Lovelace" }]);

    await expect(searchHikers("Ada Lovelace", { signal: controller.signal })).resolves.toEqual([
      { id: 12, firstName: "Ada", lastName: "Lovelace" },
    ]);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://localhost:4000/api/v1/staff/hikers?q=Ada%20Lovelace",
    );
    expect(options).toMatchObject({
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });
  });

  it("createStaffReservation sends existing-hiker payloads", async () => {
    const payload = { slotId: 7, partySize: 3, hikerId: 12, requirements: [] };
    const fetchMock = mockFetch(201, { id: 41, hiker: { id: 12 } });

    await expect(createStaffReservation(payload)).resolves.toMatchObject({ id: 41 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/v1/staff/reservations");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it("createStaffReservation sends new full and temporary hiker payloads", async () => {
    const fetchMock = mockFetch(201, { id: 42, temporaryPassword: "Ab12Cd34Ef56" });
    await createStaffReservation({
      slotId: 7,
      partySize: 2,
      newHiker: {
        email: "anna@example.com",
        firstName: "Anna",
        lastName: "Neri",
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).newHiker.email).toBe(
      "anna@example.com",
    );

    fetchMock.mockClear();
    await createStaffReservation({
      slotId: 7,
      partySize: 1,
      temporaryHiker: { firstName: "Luca", lastName: "Neri" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).temporaryHiker).toEqual({
      firstName: "Luca",
      lastName: "Neri",
    });
  });
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
    expect(JSON.parse(options.body)).toEqual({ slotId: 7, partySize: 2, requirements: [] });
  });

  it("createReservation includes the supplied party requirements", async () => {
    const fetchMock = mockFetch(201, { id: 15, confirmationSent: true });
    const requirements = [
      { peopleCount: 1, hasAllergies: true, description: "Peanuts" },
    ];

    await createReservation(7, 2, requirements);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      slotId: 7,
      partySize: 2,
      requirements,
    });
  });

  it("fetchStaffReservations sends the selected date, slot, and status as GET filters", async () => {
    // MH-05 staff results are filtered on the server; verify the filter values
    // are serialized into the expected URL and the session cookie is included.
    const reservations = [
      {
        id: 41,
        hasAllergies: true,
        requirements: [
          { peopleCount: 1, hasAllergies: true, description: "Peanuts" },
        ],
      },
    ];
    const fetchMock = mockFetch(200, reservations);

    expect(
      await fetchStaffReservations({
        date: "2026-11-10",
        slotId: 7,
        status: "confirmed",
      }),
    ).toEqual(reservations);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://localhost:4000/api/v1/reservations?date=2026-11-10&slotId=7&status=confirmed",
    );
    expect(options).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("omits unselected staff filters and supports a request with no filters", async () => {
    // Empty, null, and undefined filter values should not appear in the query
    // string, allowing the API to apply its defaults for the remaining fields.
    const fetchMock = mockFetch(200, []);

    await fetchStaffReservations({
      date: "2026-11-10",
      slotId: "",
      status: null,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/reservations?date=2026-11-10",
    );

    fetchMock.mockClear();
    await fetchStaffReservations();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/reservations",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("surfaces the backend error details when staff bookings cannot be loaded", async () => {
    // Staff must receive the API's actual error code and message to distinguish
    // an authorization or availability problem from a successful empty result.
    mockFetch(403, {
      error: "FORBIDDEN",
      message: "Staff access is required.",
    });

    await expect(fetchStaffReservations({ date: "2026-11-10" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Staff access is required.",
    });
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
