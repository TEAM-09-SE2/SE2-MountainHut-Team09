import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ChangeBooking from "../../../src/pages/ChangeBooking";
import {
  fetchMyReservations,
  fetchSlotsByDate,
  changeReservation,
} from "../../../src/services/reservationApi";

vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, role: "hiker", name: "Mario" },
    logout: vi.fn(),
  }),
}));

vi.mock("../../../src/services/reservationApi", () => ({
  fetchMyReservations: vi.fn(),
  fetchSlotsByDate: vi.fn(),
  changeReservation: vi.fn(),
}));

const MOCK_BOOKING = {
  id: 42,
  status: "confirmed",
  partySize: 2,
  changeable: true,
  slot: { id: 10, startAt: "2026-12-10T12:00:00.000Z", endAt: "2026-12-10T13:00:00.000Z" },
  requirements: [],
};

const MOCK_SLOTS = [
  { id: 10, startAt: "2026-12-10T12:00:00.000Z", endAt: "2026-12-10T13:00:00.000Z", freeSeats: 5, bookable: true },
  { id: 11, startAt: "2026-12-10T19:00:00.000Z", endAt: "2026-12-10T21:00:00.000Z", freeSeats: 2, bookable: true },
];

function renderChangeBooking() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/my-bookings/42/change"]}>
      <Routes>
        <Route path="/my-bookings/:id/change" element={<ChangeBooking />} />
      </Routes>
    </MemoryRouter>
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyReservations.mockResolvedValue([MOCK_BOOKING]);
  fetchSlotsByDate.mockResolvedValue(MOCK_SLOTS);
});

describe("ChangeBooking Flow", () => {
  it("shows an error if the booking is not changeable", async () => {
    fetchMyReservations.mockResolvedValue([{ ...MOCK_BOOKING, changeable: false }]);
    renderChangeBooking();

    expect(await screen.findByText("This booking cannot be changed")).toBeInTheDocument();
    expect(screen.getByText("Changes close 48 hours before the slot.")).toBeInTheDocument();
  });

  it("pre-fills the form and saves ONLY changed fields (partial update)", async () => {
    changeReservation.mockResolvedValue({ ...MOCK_BOOKING, partySize: 3, confirmationSent: true });
    const user = renderChangeBooking();

    await screen.findByText(/Party size/);

    // Submit button should be disabled initially (no changes yet)
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();

    // Increase party size
    await user.click(screen.getByRole("button", { name: "Increase party size" }));
    expect(screen.getByText("3 people")).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: /Save changes/ });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    // Assert that the API was called ONLY with partySize
    expect(changeReservation).toHaveBeenCalledWith(42, { partySize: 3 });

    expect(await screen.findByText("Change confirmed")).toBeInTheDocument();
    expect(screen.getByText("An update email has been sent.")).toBeInTheDocument();
  });

  it("handles NOT_ENOUGH_SEATS error gracefully", async () => {
    changeReservation.mockRejectedValue(
      Object.assign(new Error("Conflict"), { status: 409, code: "NOT_ENOUGH_SEATS" })
    );
    const user = renderChangeBooking();

    await screen.findByText(/Party size/);

    // Change slot
    await user.click(await screen.findByText(/20:00/));
    await user.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(await screen.findByText("Change refused")).toBeInTheDocument();
    expect(screen.getByText(/There are not enough seats in the chosen slot/)).toBeInTheDocument();
  });

  it("re-fetches slots when the date is changed", async () => {
    const user = renderChangeBooking();
    await screen.findByText(/Party size/);

    const dateInput = screen.getByLabelText("Date");
    vi.mocked(fetchSlotsByDate).mockClear();

    // Clear the field fully before typing
    await user.clear(dateInput);
    await user.type(dateInput, "2026-12-15");

    expect(fetchSlotsByDate).toHaveBeenCalledWith("2026-12-15");
  });

  it("shows an amber warning if the update succeeds but the email fails", async () => {
    changeReservation.mockResolvedValue({
      ...MOCK_BOOKING,
      partySize: 3,
      confirmationSent: false
    });
    const user = renderChangeBooking();

    await screen.findByText(/Party size/);
    await user.click(screen.getByRole("button", { name: "Increase party size" }));
    await user.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(await screen.findByText("Change confirmed")).toBeInTheDocument();
    expect(screen.getByText(/we could not send the update email/i)).toBeInTheDocument();
  });

  it("includes requirements in the payload if they are modified", async () => {
    changeReservation.mockResolvedValue({ ...MOCK_BOOKING, confirmationSent: true });
    const user = renderChangeBooking();

    await screen.findByText(/Party size/);

    const addButton = screen.getByRole("button", { name: /Add requirement/i });
    await user.click(addButton);

    const descInput = await screen.findByRole("textbox", { name: /description/i });
    await user.type(descInput, "Gluten free");

    await user.click(screen.getByRole("button", { name: /Save changes/ }));

    // Assert that the API payload correctly includes the requirements
    expect(changeReservation).toHaveBeenCalledWith(42, {
      requirements: [{ peopleCount: 1, hasAllergies: false, description: "Gluten free" }]
    });
  });
});