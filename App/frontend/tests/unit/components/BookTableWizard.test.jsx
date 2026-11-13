import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BookTableWizard from "../../../src/components/booking/BookTableWizard";
import {
  fetchSlotsByDate,
  createReservation,
} from "../../../src/services/reservationApi";

//No real backend: each test decides what the API returns
vi.mock("../../../src/services/reservationApi", () => ({
  fetchSlotsByDate: vi.fn(),
  createReservation: vi.fn(),
}));

const SLOTS = [
  {
    id: 4,
    startAt: "2026-11-05T12:00:00.000Z",
    endAt: "2026-11-05T13:00:00.000Z",
    totalSeats: 24,
    freeSeats: 24,
    bookable: true,
  },
  {
    id: 5,
    startAt: "2026-11-05T18:30:00.000Z",
    endAt: "2026-11-05T20:00:00.000Z",
    totalSeats: 20,
    freeSeats: 0,
    bookable: true,
  },
  {
    id: 2,
    startAt: "2026-11-04T15:00:00.000Z",
    endAt: "2026-11-04T16:00:00.000Z",
    totalSeats: 10,
    freeSeats: 7,
    bookable: false,
  },
];

//MemoryRouter is needed because the wizard contains the "Back to home" link
function renderWizard() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <BookTableWizard />
    </MemoryRouter>,
  );
  return user;
}

//Goes through the 4 steps with the first slot and the default party size (2 guests)
async function bookFirstSlot(user) {
  await user.click(
    await screen.findByRole("button", { name: /24 seats free/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Continue to party size/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Check Table Assignment/ }),
  );
  await user.click(screen.getByRole("button", { name: /Proceed to summary/ }));
  await user.click(screen.getByRole("button", { name: /Confirm Reservation/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSlotsByDate.mockResolvedValue(SLOTS);
});

describe("BookTableWizard", () => {
  it("shows the slots of the day and disables the full and closed ones", async () => {
    renderWizard();

    expect(
      await screen.findByRole("button", { name: /24 seats free/ }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: /0 seats free/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Closed \(<2h\)/ }),
    ).toBeDisabled();
  });

  it("labels the unavailable slots so they stand out from the available ones", async () => {
    renderWizard();

    const full = await screen.findByRole("button", { name: /0 seats free/ });
    const closed = screen.getByRole("button", { name: /Closed \(<2h\)/ });
    const open = screen.getByRole("button", { name: /24 seats free/ });

    expect(full).toHaveTextContent("Not available");
    expect(closed).toHaveTextContent("Not available");
    expect(open).not.toHaveTextContent("Not available");
  });

  it("cannot go on until a slot is selected", async () => {
    renderWizard();
    await screen.findByRole("button", { name: /24 seats free/ });

    expect(
      screen.getByRole("button", { name: /Continue to party size/ }),
    ).toBeDisabled();
  });

  it("books the selected slot and shows the confirmation without table numbers", async () => {
    createReservation.mockResolvedValue({
      id: 15,
      slotId: 4,
      startAt: SLOTS[0].startAt,
      partySize: 2,
      status: "confirmed",
      tables: [{ tableNumber: 3, seats: 2 }],
      confirmationSent: true,
    });
    const user = renderWizard();

    await bookFirstSlot(user);

    expect(createReservation).toHaveBeenCalledWith(4, 2);
    expect(await screen.findByText("Booking Confirmed!")).toBeInTheDocument();
    expect(screen.getByText(/confirmed for/)).toHaveTextContent(
      "Reservation MH-15 confirmed for 2 guests.",
    );
    expect(screen.queryByText(/table/i)).not.toBeInTheDocument();
  });

  it("shows a clear message when the hiker already booked the slot", async () => {
    createReservation.mockRejectedValue(
      Object.assign(new Error("Conflict"), {
        status: 409,
        code: "ALREADY_BOOKED",
      }),
    );
    const user = renderWizard();

    await bookFirstSlot(user);

    expect(
      await screen.findByText(
        "You already have a confirmed booking for this slot.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Booking Confirmed!")).not.toBeInTheDocument();
  });

  it("shows a clear message when the seats ran out in the meantime", async () => {
    createReservation.mockRejectedValue(
      Object.assign(new Error("Conflict"), {
        status: 409,
        code: "NOT_ENOUGH_SEATS",
      }),
    );
    const user = renderWizard();

    await bookFirstSlot(user);

    expect(
      await screen.findByText(
        "Not enough free seats for the requested party size.",
      ),
    ).toBeInTheDocument();
  });

  it("always shows a link back to the home page", async () => {
    createReservation.mockResolvedValue({
      id: 15,
      startAt: SLOTS[0].startAt,
      partySize: 2,
      tables: [],
    });
    const user = renderWizard();

    expect(screen.getByRole("link", { name: /Back to home/ })).toHaveAttribute(
      "href",
      "/",
    );

    await bookFirstSlot(user);
    await screen.findByText("Booking Confirmed!");
    expect(screen.getByRole("link", { name: /Back to home/ })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
