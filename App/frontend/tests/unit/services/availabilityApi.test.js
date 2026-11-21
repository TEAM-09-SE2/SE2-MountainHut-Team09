import { checkAvailability } from "../../../src/services/availabilityApi";

describe("checkAvailability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a public GET request with the search parameters", async () => {
    const data = { available: true };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => data,
      }),
    );

    await expect(checkAvailability("2099-12-31", "18:30", 6)).resolves.toBe(
      data,
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/availability?date=2099-12-31&time=18%3A30&partySize=6",
      { method: "GET" },
    );
  });

  it("surfaces API status, error code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: "BOOKING_CLOSED",
          message: "Bookings are closed for this slot.",
        }),
      }),
    );

    await expect(checkAvailability("2099-12-31", "18:30", 2)).rejects.toMatchObject({
      message: "Bookings are closed for this slot.",
      status: 422,
      code: "BOOKING_CLOSED",
    });
  });

  it("uses a safe fallback when an error response is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new SyntaxError("Invalid JSON");
        },
      }),
    );

    await expect(checkAvailability("2099-12-31", "18:30", 2)).rejects.toMatchObject({
      message: "An unexpected error occurred.",
      status: 503,
      code: "UNKNOWN_ERROR",
    });
  });
});
