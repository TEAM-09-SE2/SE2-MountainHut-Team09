import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ChangeBooking from "../../../src/pages/ChangeBooking";
import {
  changeReservation,
  fetchMyReservations,
  fetchSlotsByDate,
} from "../../../src/services/reservationApi";

vi.mock("../../../src/services/reservationApi", () => ({
  fetchMyReservations: vi.fn(),
  fetchSlotsByDate: vi.fn(),
  changeReservation: vi.fn(),
}));
vi.mock("../../../src/components/common/Navbar", () => ({ default: () => null }));

const CURRENT_SLOT = {
  id: 7,
  startAt: "2030-11-20T18:00:00.000Z",
  endAt: "2030-11-20T19:15:00.000Z",
};
const OTHER_SLOT = {
  id: 8,
  startAt: "2030-11-20T19:30:00.000Z",
  endAt: "2030-11-20T20:45:00.000Z",
  totalSeats: 16,
  freeSeats: 10,
  bookable: true,
};
const FULL_SLOT = {
  id: 9,
  startAt: "2030-11-20T11:00:00.000Z",
  endAt: "2030-11-20T12:00:00.000Z",
  totalSeats: 16,
  freeSeats: 1,
  bookable: true,
};

const BOOKING = {
  id: 31,
  slot: CURRENT_SLOT,
  partySize: 4,
  status: "confirmed",
  changeable: true,
  cancellable: true,
  requirements: [
    { id: 1, peopleCount: 1, hasAllergies: true, description: "Peanuts" },
  ],
};

function renderPage() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/my-bookings/31/change"]}>
      <Routes>
        <Route path="/my-bookings/:id/change" element={<ChangeBooking />} />
      </Routes>
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  fetchMyReservations.mockResolvedValue([BOOKING]);
  fetchSlotsByDate.mockResolvedValue([
    { ...CURRENT_SLOT, totalSeats: 16, freeSeats: 4, bookable: true },
    OTHER_SLOT,
    FULL_SLOT,
  ]);
});

describe("ChangeBooking", () => {
  it("clears previous slots and blocks saving while a new date loads or has no slots", async () => {
    const user = renderPage();
    await user.click(await screen.findByRole("button", { name: /10 seats free/ }, { timeout: 5000 }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

    let resolveSlots;
    fetchSlotsByDate.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSlots = resolve;
    }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-11-21" } });

    expect(screen.queryByRole("button", { name: /10 seats free/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await act(async () => resolveSlots([]));
    expect(screen.getByText("No slots on this date.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(changeReservation).not.toHaveBeenCalled();
  });

  it("saves a slot from the new date only after it has loaded and been selected", async () => {
    const user = renderPage();
    await screen.findByRole("button", { name: /10 seats free/ });
    const nextSlot = {
      ...OTHER_SLOT,
      id: 10,
      startAt: "2030-11-21T19:30:00.000Z",
      endAt: "2030-11-21T20:45:00.000Z",
    };
    fetchSlotsByDate.mockResolvedValueOnce([nextSlot]);
    changeReservation.mockResolvedValue({
      id: BOOKING.id,
      partySize: BOOKING.partySize,
      requirements: BOOKING.requirements,
      confirmationSent: true,
    });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-11-21" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: /10 seats free/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(changeReservation).toHaveBeenCalledWith(BOOKING.id, { slotId: nextSlot.id });
    expect(await screen.findByText("Change confirmed")).toBeInTheDocument();
  });

  it("starts prefilled with Save disabled until something changes", async () => {
    renderPage();

    expect(await screen.findByText("1 of 4 people associated · maximum 4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Peanuts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("sends only the changed fields and shows the outcome with the email status", async () => {
    changeReservation.mockResolvedValue({
      id: 31,
      slotId: 8,
      partySize: 4,
      status: "confirmed",
      requirements: BOOKING.requirements,
      confirmationSent: false,
    });
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: /10 seats free/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(changeReservation).toHaveBeenCalledWith(31, { slotId: 8 });
    expect(await screen.findByText("Change confirmed")).toBeInTheDocument();
    expect(screen.getByText(/could not send the update email/)).toBeInTheDocument();
  });

  it("blocks saving when the requirements exceed the party size", async () => {
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Decrease party size" }));
    await user.click(screen.getByRole("button", { name: "Decrease party size" }));
    await user.click(screen.getByRole("button", { name: "Decrease party size" }));
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(screen.getByLabelText("Description for requirement 2"), "Vegan");

    expect(
      screen.getByText("The requirements cover 2 people, but the party has only 1."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("disables slots without enough seats", async () => {
    renderPage();

    expect(await screen.findByRole("button", { name: /Not enough seats/ })).toBeDisabled();
  });

  it("keeps the booking and offers another slot when the API has no seats", async () => {
    changeReservation.mockRejectedValue(
      Object.assign(new Error("no seats"), { code: "NOT_ENOUGH_SEATS", status: 409 }),
    );
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: /10 seats free/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Change refused")).toBeInTheDocument();
    expect(screen.getByText(/original booking is unchanged/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose another slot" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("does not offer the form when the booking is not changeable", async () => {
    fetchMyReservations.mockResolvedValue([{ ...BOOKING, changeable: false }]);
    renderPage();

    expect(await screen.findByText("This booking cannot be changed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
