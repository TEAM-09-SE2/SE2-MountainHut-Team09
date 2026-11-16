import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StaffBookings from "../../../src/pages/StaffBookings";
import {
  fetchSlotsByDate,
  fetchStaffReservations,
} from "../../../src/services/reservationApi";

// Keep site navigation separate from the staff booking and requirements behavior.
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

vi.mock("../../../src/services/reservationApi", () => ({
  fetchSlotsByDate: vi.fn(),
  fetchStaffReservations: vi.fn(),
}));

const DATE = "2030-11-20";
const OTHER_DATE = "2030-11-21";
const SLOTS = [
  {
    id: 7,
    startAt: `${DATE}T12:00:00.000Z`,
    endAt: `${DATE}T13:00:00.000Z`,
    freeSeats: 8,
  },
  {
    id: 8,
    startAt: `${DATE}T18:00:00.000Z`,
    endAt: `${DATE}T19:00:00.000Z`,
    freeSeats: 6,
  },
];

const BOOKINGS = [
  {
    id: 41,
    status: "confirmed",
    partySize: 2,
    slot: SLOTS[0],
    tables: [{ tableNumber: 3, seats: 2 }],
    hasAllergies: true,
    requirements: [
      { id: 1, peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
      { id: 2, peopleCount: 1, hasAllergies: false, description: "Vegetarian" },
    ],
    hiker: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "123456789",
      isTemporary: false,
      notes: "Please serve the allergy meal separately.",
    },
  },
  {
    id: 42,
    status: "confirmed",
    partySize: 1,
    slot: SLOTS[0],
    tables: [],
    hasAllergies: false,
    requirements: [
      { id: 3, peopleCount: 1, hasAllergies: false, description: "Vegan" },
    ],
    hiker: {
      firstName: "Grace",
      lastName: "Hopper",
      isTemporary: true,
    },
    createdBy: { firstName: "Staff", lastName: "Member" },
  },
  {
    id: 43,
    status: "cancelled",
    partySize: 4,
    slot: SLOTS[1],
    tables: [{ tableNumber: 5, seats: 4 }],
    hasAllergies: true,
    requirements: [
      { id: 4, peopleCount: 4, hasAllergies: true, description: "Shellfish allergy" },
    ],
    hiker: {
      firstName: "Katherine",
      lastName: "Johnson",
    },
  },
];

function renderStaffBookings() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StaffBookings />
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSlotsByDate.mockResolvedValue(SLOTS);
  fetchStaffReservations.mockResolvedValue(BOOKINGS);
});

describe("StaffBookings", () => {
  it("loads the selected day's slots and bookings and displays each requirement subset", async () => {
    // Staff needs the hiker, party, seating, and per-subset dietary details
    // together; allergy rows must retain their count and clear allergy marker.
    renderStaffBookings();

    const booking = await screen.findByTestId("staff-booking-41");
    expect(screen.getByRole("heading", { name: "Bookings" })).toBeInTheDocument();
    expect(booking).toHaveTextContent("MH-41");
    expect(booking).toHaveTextContent("Ada Lovelace");
    expect(booking).toHaveTextContent("ada@example.com");
    expect(booking).toHaveTextContent("123456789");
    expect(booking).toHaveTextContent("Table 3 · 2 seats");
    expect(booking).toHaveTextContent("1 × Peanut allergy (allergy)");
    expect(booking).toHaveTextContent("1 × Vegetarian");
    expect(booking).toHaveTextContent(
      "Allergies · special care needed",
    );
    expect(booking).toHaveTextContent(
      "Hiker notes: Please serve the allergy meal separately.",
    );
    expect(fetchSlotsByDate).toHaveBeenCalledWith(
      screen.getByLabelText("Day").value,
    );
    expect(fetchStaffReservations).toHaveBeenCalledWith({
      date: screen.getByLabelText("Day").value,
      slotId: "",
      status: "",
    });
  });

  it("groups bookings by slot and reports confirmed party and allergy totals", async () => {
    // Cancelled reservations remain visible but are excluded from confirmed
    // guest and allergy summaries, because they are not expected at the hut.
    renderStaffBookings();

    const firstBooking = await screen.findByTestId("staff-booking-41");
    const firstSlot = firstBooking.closest("section");
    expect(firstSlot).toHaveAttribute("aria-labelledby", "slot-7");
    expect(within(firstSlot).getByTestId("staff-booking-42")).toBeInTheDocument();
    expect(screen.getByTestId("staff-booking-43").closest("section")).toHaveAttribute(
      "aria-labelledby",
      "slot-8",
    );

    expect(screen.getByText("3 bookings")).toBeInTheDocument();
    expect(screen.getByText("3 people confirmed")).toBeInTheDocument();
    expect(screen.getByText("1 booking with allergies")).toBeInTheDocument();
    expect(screen.getByTestId("staff-booking-43")).toHaveTextContent("Cancelled");
    expect(screen.getByTestId("staff-booking-43")).not.toHaveTextContent(
      "Allergies · special care needed",
    );
  });

  it("shows a no-allergies summary when there are no confirmed bookings with allergies", async () => {
    // Allergy counts in the page summary are based on confirmed bookings, even
    // when an allergy-bearing cancelled booking is still present in the results.
    fetchStaffReservations.mockResolvedValue([
      { ...BOOKINGS[1], id: 45 },
      { ...BOOKINGS[2], id: 46, hasAllergies: true },
    ]);
    renderStaffBookings();

    await screen.findByTestId("staff-booking-45");

    expect(screen.getByText("1 person confirmed")).toBeInTheDocument();
    expect(screen.getByText("No allergies")).toBeInTheDocument();
    expect(screen.queryByText("1 booking with allergies")).not.toBeInTheDocument();
  });

  it("refetches bookings when status or slot filters change and sends all selected filters", async () => {
    // Filtering is performed by the API, so every changed control must request
    // the same selected date together with the current slot and status values.
    const user = renderStaffBookings();
    await screen.findByTestId("staff-booking-41");

    await user.selectOptions(screen.getByLabelText("Status"), "confirmed");
    await waitFor(() => {
      expect(fetchStaffReservations).toHaveBeenLastCalledWith({
        date: screen.getByLabelText("Day").value,
        slotId: "",
        status: "confirmed",
      });
    });

    await user.selectOptions(screen.getByLabelText("Slot"), "8");
    await waitFor(() => {
      expect(fetchStaffReservations).toHaveBeenLastCalledWith({
        date: screen.getByLabelText("Day").value,
        slotId: "8",
        status: "confirmed",
      });
    });
  });

  it("clears the selected slot when the day changes and reloads that day's filters", async () => {
    // Slot IDs are date-specific; changing the day must remove a previously
    // selected slot before fetching bookings to avoid applying a stale filter.
    const user = renderStaffBookings();
    await screen.findByTestId("staff-booking-41");
    await user.selectOptions(screen.getByLabelText("Slot"), "8");
    await waitFor(() => {
      expect(fetchStaffReservations).toHaveBeenLastCalledWith({
        date: screen.getByLabelText("Day").value,
        slotId: "8",
        status: "",
      });
    });

    await user.clear(screen.getByLabelText("Day"));
    await user.type(screen.getByLabelText("Day"), OTHER_DATE);

    await waitFor(() => {
      expect(fetchSlotsByDate).toHaveBeenLastCalledWith(OTHER_DATE);
      expect(fetchStaffReservations).toHaveBeenLastCalledWith({
        date: OTHER_DATE,
        slotId: "",
        status: "",
      });
    });
    expect(screen.getByLabelText("Slot")).toHaveValue("");
  });

  it("shows the empty state when the API returns no bookings", async () => {
    // An empty successful response differs from a loading or error state and
    // should tell staff that the chosen filters returned no results.
    fetchStaffReservations.mockResolvedValue([]);
    renderStaffBookings();

    expect(
      await screen.findByText(/No bookings for/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Try another day, slot or status."),
    ).toBeInTheDocument();
  });

  it("shows API failures and retries the same selected filters", async () => {
    // Temporary failures must be visible and recoverable without changing the
    // staff's chosen day, slot, or status.
    fetchStaffReservations
      .mockRejectedValueOnce(new Error("Staff booking service unavailable"))
      .mockResolvedValueOnce([BOOKINGS[0]]);
    const user = renderStaffBookings();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Staff booking service unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByTestId("staff-booking-41")).toBeInTheDocument();
    expect(fetchStaffReservations).toHaveBeenLastCalledWith({
      date: screen.getByLabelText("Day").value,
      slotId: "",
      status: "",
    });
  });
});
