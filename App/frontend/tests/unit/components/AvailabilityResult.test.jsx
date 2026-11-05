import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AvailabilityResult from "../../../src/components/availability/AvailabilityResult";
import { useAuth } from "../../../src/context/AuthContext";

vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const SLOT = {
  id: 8,
  startAt: "2099-12-31T17:00:00.000Z",
  endAt: "2099-12-31T20:00:00.000Z",
};

function renderResult(result) {
  return render(
    <MemoryRouter>
      <AvailabilityResult result={result} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: null });
});

describe("AvailabilityResult", () => {
  it("shows the free-seat split and lets a visitor continue to login", () => {
    renderResult({
      available: true,
      date: "2099-12-31",
      partySize: 6,
      freeSeats: 6,
      slot: SLOT,
      allocation: [
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 3 },
        { tableNumber: 3, seats: 1 },
      ],
    });

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(
      screen.getByText("Split over 3 tables: 2 + 3 + 1 seats."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Log in to book/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("explains when there is no meal slot and does not offer a booking action", () => {
    renderResult({
      reason: "NO_SLOT",
      time: "18:30",
    });

    expect(
      screen.getByRole("heading", { name: "No meal slot at this time" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no slot covering 18:30/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the difference between a full slot and too few seats", () => {
    const { rerender } = renderResult({
      available: false,
      reason: "NOT_ENOUGH_SEATS",
      freeSeats: 2,
      partySize: 4,
      slot: SLOT,
    });

    expect(screen.getByText("Not enough seats")).toBeInTheDocument();
    expect(
      screen.getByText("Only 2 seats left, not enough for 4 people."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not available" })).toBeDisabled();

    rerender(
      <MemoryRouter>
        <AvailabilityResult
          result={{
            available: false,
            reason: "NOT_ENOUGH_SEATS",
            freeSeats: 0,
            partySize: 4,
            slot: SLOT,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.getByText("This slot is fully booked.")).toBeInTheDocument();
  });

  it("explains when bookings have closed", () => {
    renderResult({
      available: false,
      reason: "BOOKING_CLOSED",
      freeSeats: 6,
      slot: SLOT,
    });

    expect(screen.getByText("Booking closed")).toBeInTheDocument();
    expect(
      screen.getByText("Bookings close 2 hours before the slot starts."),
    ).toBeInTheDocument();
  });
});
