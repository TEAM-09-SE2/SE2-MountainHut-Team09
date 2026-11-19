import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MyBookings from "../../../src/pages/MyBookings";
import {
  cancelReservation,
  fetchMyReservations,
} from "../../../src/services/reservationApi";

vi.mock("../../../src/services/reservationApi", () => ({
  fetchMyReservations: vi.fn(),
  cancelReservation: vi.fn(),
}));
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));
vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 4, role: "hiker", email: "anna@example.com" },
  }),
}));

const booking = (overrides) => ({
  id: 31,
  slot: {
    id: 7,
    startAt: "2030-11-20T11:00:00.000Z",
    endAt: "2030-11-20T12:00:00.000Z",
  },
  partySize: 4,
  status: "confirmed",
  changeable: true,
  cancellable: true,
  cancelledAt: null,
  requirements: [],
  ...overrides,
});

const cancelledAnswer = (overrides) => ({
  id: 31,
  slotId: 7,
  startAt: "2030-11-20T11:00:00.000Z",
  partySize: 4,
  status: "cancelled",
  cancelledAt: "2030-11-18T09:30:00.000Z",
  cancelledBy: { id: 4, firstName: "Anna", lastName: "Neri", role: "hiker" },
  confirmationSent: true,
  ...overrides,
});

function renderPage() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <MyBookings />
    </MemoryRouter>,
  );
  return user;
}

const cancelButtonOf = (card) =>
  within(card).queryByRole("button", { name: /^Cancel booking MH-/ });

//Opens the dialog of the booking and confirms it
async function cancelFromCard(user, card) {
  await user.click(cancelButtonOf(card));
  const dialog = screen.getByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel booking" }),
  );
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MyBookings – cancel a booking (MH-08)", () => {
  it("shows Cancel only on the bookings the API marks as cancellable", async () => {
    fetchMyReservations.mockResolvedValue([
      booking(),
      //Less than 48 hours to the slot: it can't be changed but it can still be cancelled
      booking({ id: 32, changeable: false }),
      //Slot ended for the server: nothing can be done
      booking({ id: 33, changeable: false, cancellable: false }),
      booking({
        id: 34,
        status: "cancelled",
        changeable: false,
        cancellable: false,
      }),
    ]);

    renderPage();

    const open = await screen.findByTestId("booking-31");
    expect(cancelButtonOf(open)).toBeInTheDocument();
    expect(
      within(open).getByRole("link", { name: /Change/ }),
    ).toBeInTheDocument();

    const late = screen.getByTestId("booking-32");
    expect(cancelButtonOf(late)).toBeInTheDocument();
    expect(within(late).queryByRole("link", { name: /Change/ })).toBeNull();

    expect(cancelButtonOf(screen.getByTestId("booking-33"))).toBeNull();
    expect(cancelButtonOf(screen.getByTestId("booking-34"))).toBeNull();
    expect(
      screen.getByText(/can no longer be changed, but you can still cancel it/),
    ).toBeInTheDocument();
  });

  it("asks for confirmation and does nothing when the hiker keeps the booking", async () => {
    fetchMyReservations.mockResolvedValue([booking()]);
    const user = renderPage();

    const card = await screen.findByTestId("booking-31");
    await user.click(cancelButtonOf(card));

    const dialog = screen.getByRole("alertdialog", {
      name: "Cancel booking MH-31?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Keep booking" }),
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(cancelReservation).not.toHaveBeenCalled();
    expect(card).toHaveTextContent("Confirmed");
    expect(cancelButtonOf(card)).toHaveFocus();
  });

  it("greys out the cancelled booking, keeps it in the list and says the email was sent", async () => {
    fetchMyReservations.mockResolvedValue([booking(), booking({ id: 32 })]);
    cancelReservation.mockResolvedValue(cancelledAnswer());
    const user = renderPage();

    const card = await screen.findByTestId("booking-31");
    await cancelFromCard(user, card);

    expect(cancelReservation).toHaveBeenCalledWith(31);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(card).toHaveTextContent("Cancelled");
    expect(card).not.toHaveTextContent("Confirmed");
    expect(card).toHaveClass("bg-slate-100");
    expect(cancelButtonOf(card)).toBeNull();
    expect(within(card).queryByRole("link", { name: /Change/ })).toBeNull();
    expect(card).toHaveTextContent(
      "Booking cancelled. A cancellation email has been sent to anna@example.com.",
    );
    //The focus goes to the result, as the button that had it is gone
    expect(document.getElementById("cancel-outcome-31")).toHaveFocus();
    //The other booking is untouched and the list is not reloaded
    expect(
      cancelButtonOf(screen.getByTestId("booking-32")),
    ).toBeInTheDocument();
    expect(fetchMyReservations).toHaveBeenCalledTimes(1);
  });

  it("says when the cancellation email could not be sent", async () => {
    fetchMyReservations.mockResolvedValue([booking()]);
    cancelReservation.mockResolvedValue(
      cancelledAnswer({ confirmationSent: false }),
    );
    const user = renderPage();

    const card = await screen.findByTestId("booking-31");
    await cancelFromCard(user, card);

    expect(card).toHaveTextContent("Cancelled");
    expect(card).toHaveTextContent(
      "We could not send you the cancellation email.",
    );
  });

  it("explains a refusal and reloads the list behind the dialog", async () => {
    fetchMyReservations
      .mockResolvedValueOnce([booking()])
      //Meanwhile the slot ended: the API no longer lists the booking
      .mockResolvedValueOnce([]);
    cancelReservation.mockRejectedValue(
      Object.assign(new Error("The slot has already ended."), {
        status: 422,
        code: "SLOT_ENDED",
      }),
    );
    const user = renderPage();

    const card = await screen.findByTestId("booking-31");
    const dialog = await cancelFromCard(user, card);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Booking MH-31 can no longer be cancelled: its slot has already ended.",
    );
    expect(fetchMyReservations).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("No upcoming bookings")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "My bookings" })).toHaveFocus();
  });

  it("shows a booking cancelled earlier as greyed out, without an email result", async () => {
    fetchMyReservations.mockResolvedValue([
      booking({
        status: "cancelled",
        changeable: false,
        cancellable: false,
        cancelledAt: "2030-11-18T09:30:00.000Z",
      }),
    ]);

    renderPage();

    const card = await screen.findByTestId("booking-31");
    expect(card).toHaveTextContent("Cancelled");
    expect(card).toHaveClass("bg-slate-100");
    expect(card).toHaveTextContent("Cancelled booking · no action available");
    expect(card).not.toHaveTextContent("Booking cancelled.");
  });
});
