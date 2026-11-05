import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CheckAvailability from "../../../src/pages/CheckAvailability";
import { useAuth } from "../../../src/context/AuthContext";

vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const ENDPOINT =
  "http://localhost:4000/api/v1/availability?date=2099-12-31&time=18%3A30&partySize=6";

function renderAvailabilityPage() {
  return render(
    <MemoryRouter initialEntries={["/availability"]}>
      <CheckAvailability />
    </MemoryRouter>,
  );
}

function enterSearch(user) {
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2099-12-31" },
  });
  fireEvent.change(screen.getByLabelText("Time"), {
    target: { value: "18:30" },
  });
  fireEvent.change(screen.getByLabelText("People"), {
    target: { value: "6" },
  });
  return user.click(screen.getByRole("button", { name: "Check availability" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  useAuth.mockReturnValue({ user: null, logout: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("availability search integration", () => {
  it("checks a public search through the API and displays the seating split", async () => {
    const user = userEvent.setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        date: "2099-12-31",
        time: "18:30",
        partySize: 6,
        freeSeats: 6,
        slot: {
          id: 8,
          startAt: "2099-12-31T17:00:00.000Z",
          endAt: "2099-12-31T20:00:00.000Z",
        },
        allocation: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 3 },
          { tableNumber: 3, seats: 1 },
        ],
      }),
    });

    renderAvailabilityPage();
    await enterSearch(user);

    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(
      screen.getByText("Split over 3 tables: 2 + 3 + 1 seats."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log in to book/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(ENDPOINT, { method: "GET" });
  });

  it("renders a no-slot response from the API", async () => {
    const user = userEvent.setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        available: false,
        reason: "NO_SLOT",
        date: "2099-12-31",
        time: "18:30",
        partySize: 6,
        slot: null,
        freeSeats: null,
        allocation: null,
      }),
    });

    renderAvailabilityPage();
    await enterSearch(user);

    expect(
      await screen.findByRole("heading", { name: "No meal slot at this time" }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows backend errors and offers retry for a temporary outage", async () => {
    const user = userEvent.setup();
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: "SERVICE_UNAVAILABLE",
          message: "The service is temporarily unavailable.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: false,
          reason: "NOT_ENOUGH_SEATS",
          date: "2099-12-31",
          time: "18:30",
          partySize: 6,
          freeSeats: 0,
          slot: {
            id: 8,
            startAt: "2099-12-31T17:00:00.000Z",
            endAt: "2099-12-31T20:00:00.000Z",
          },
          allocation: null,
        }),
      });

    renderAvailabilityPage();
    await enterSearch(user);

    expect(
      await screen.findByText("The service is temporarily unavailable."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("This slot is fully booked.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(ENDPOINT, { method: "GET" });
  });
});
