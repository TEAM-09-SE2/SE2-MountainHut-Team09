import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import MyBookings from "../../../src/pages/MyBookings";
import { fetchMyReservations } from "../../../src/services/reservationApi";

vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, role: "hiker", name: "Mario" },
    logout: vi.fn(),
  }),
}));

vi.mock("../../../src/services/reservationApi", () => ({
  fetchMyReservations: vi.fn(),
}));

const MOCK_BOOKINGS = [
  {
    id: 101,
    status: "confirmed",
    partySize: 4,
    slot: { id: 1, startAt: "2026-11-20T12:00:00.000Z", endAt: "2026-11-20T13:00:00.000Z" },
    changeable: true,
    requirements: [],
  },
  {
    id: 102,
    status: "confirmed",
    partySize: 2,
    slot: { id: 2, startAt: "2026-11-21T19:00:00.000Z", endAt: "2026-11-21T21:00:00.000Z" },
    changeable: false,
    requirements: [],
  },
  {
    id: 103,
    status: "cancelled",
    partySize: 1,
    slot: { id: 3, startAt: "2026-11-22T12:00:00.000Z", endAt: "2026-11-22T13:00:00.000Z" },
    changeable: false,
    requirements: [],
  },
];

function renderMyBookings() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <MyBookings />
    </MemoryRouter>
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MyBookings Component", () => {
  it("shows loading state, then the empty state if no bookings exist", async () => {
    fetchMyReservations.mockResolvedValue([]);
    renderMyBookings();

    expect(screen.getByRole("status")).toHaveTextContent("Loading your bookings");
    expect(await screen.findByText("No upcoming bookings")).toBeInTheDocument();
  });

  it("renders the list of bookings and correctly handles changeable flags", async () => {
    fetchMyReservations.mockResolvedValue(MOCK_BOOKINGS);
    renderMyBookings();

    await screen.findByTestId("booking-101");

    // 101 is changeable
    const card101 = screen.getByTestId("booking-101");
    expect(card101).toHaveTextContent("MH-101");
    expect(card101.querySelector('a[href="/my-bookings/101/change"]')).toBeInTheDocument();

    // 102 is NOT changeable
    const card102 = screen.getByTestId("booking-102");
    expect(card102).toHaveTextContent("MH-102");
    expect(card102).toHaveTextContent("Changes close 48 hours before the slot");
    expect(card102.querySelector('a[href="/my-bookings/102/change"]')).toBeNull();

    // 103 is cancelled
    const card103 = screen.getByTestId("booking-103");
    expect(card103).toHaveTextContent("MH-103");
    expect(card103).toHaveTextContent("Cancelled booking · no action available");
  });

  it("shows an error message and a retry button if the API fails", async () => {
    fetchMyReservations.mockRejectedValue(new Error("API Down"));
    const user = renderMyBookings();

    expect(await screen.findByRole("alert")).toHaveTextContent("API Down");
    
    fetchMyReservations.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    
    expect(await screen.findByText("No upcoming bookings")).toBeInTheDocument();
  });
});