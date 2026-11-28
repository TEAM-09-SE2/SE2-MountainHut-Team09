import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StaffBookings from "../../../src/pages/StaffBookings";
import {
  fetchSlotsByDate,
  fetchStaffReservations,
} from "../../../src/services/reservationApi";
import { formatLongDate, formatTime } from "../../../src/utils/bookingFormat";

vi.mock("../../../src/services/reservationApi", () => ({
  fetchSlotsByDate: vi.fn(),
  fetchStaffReservations: vi.fn(),
}));
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

const SLOT = {
  id: 7,
  startAt: "2030-11-20T11:00:00.000Z",
  endAt: "2030-11-20T12:00:00.000Z",
};
const CANCELLED_AT = "2030-11-18T09:30:00.000Z";

const booking = (overrides) => ({
  id: 41,
  status: "confirmed",
  partySize: 2,
  slot: SLOT,
  tables: [{ tableNumber: 3, seats: 2 }],
  hasAllergies: false,
  requirements: [],
  cancelledAt: null,
  cancelledBy: null,
  hiker: {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    isTemporary: false,
  },
  ...overrides,
});

function renderPage() {
  render(
    <MemoryRouter>
      <StaffBookings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSlotsByDate.mockResolvedValue([SLOT]);
});

//MH-08: only the hiker can cancel their own booking; the staff only see the cancellations
describe("StaffBookings – cancellations (MH-08)", () => {
  it("shows no Cancel button, not even on a confirmed booking whose slot has not ended", async () => {
    fetchStaffReservations.mockResolvedValue([
      booking(),
      booking({ id: 42, hiker: { firstName: "Giovanni", lastName: "Riva", email: null, isTemporary: true } }),
    ]);

    renderPage();

    for (const id of [41, 42]) {
      const card = await screen.findByTestId(`staff-booking-${id}`);
      expect(within(card).queryByRole("button", { name: /cancel/i })).toBeNull();
    }
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows when and by which hiker a booking was cancelled", async () => {
    fetchStaffReservations.mockResolvedValue([
      booking({
        status: "cancelled",
        cancelledAt: CANCELLED_AT,
        cancelledBy: {
          id: 4,
          firstName: "Ada",
          lastName: "Lovelace",
          role: "hiker",
        },
      }),
    ]);

    renderPage();

    const card = await screen.findByTestId("staff-booking-41");
    expect(card).toHaveTextContent("Cancelled");
    expect(card).toHaveTextContent(
      `Cancelled on ${formatLongDate(CANCELLED_AT)} at ${formatTime(CANCELLED_AT)} by Ada Lovelace`,
    );
  });
});
