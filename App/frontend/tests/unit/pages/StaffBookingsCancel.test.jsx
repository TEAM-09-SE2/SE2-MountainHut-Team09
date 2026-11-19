import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffBookings from "../../../src/pages/StaffBookings";
import {
  cancelStaffReservation,
  fetchSlotsByDate,
  fetchStaffReservations,
} from "../../../src/services/reservationApi";
import { formatLongDate, formatTime } from "../../../src/utils/bookingFormat";

vi.mock("../../../src/services/reservationApi", () => ({
  fetchSlotsByDate: vi.fn(),
  fetchStaffReservations: vi.fn(),
  cancelStaffReservation: vi.fn(),
}));
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

const SLOT = {
  id: 7,
  startAt: "2030-11-20T11:00:00.000Z",
  endAt: "2030-11-20T12:00:00.000Z",
};
const STAFF = {
  id: 2,
  firstName: "Giulia",
  lastName: "Bianchi",
  role: "employee",
};
const CANCELLED_AT = "2030-11-18T09:30:00.000Z";

const booking = (overrides) => ({
  id: 41,
  status: "confirmed",
  cancellable: true,
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

const temporaryHiker = {
  firstName: "Giovanni",
  lastName: "Riva",
  email: null,
  isTemporary: true,
};

const cancelledAnswer = (overrides) => ({
  id: 41,
  status: "cancelled",
  cancelledAt: CANCELLED_AT,
  cancelledBy: STAFF,
  confirmationSent: true,
  ...overrides,
});

function renderPage() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StaffBookings />
    </MemoryRouter>,
  );
  return user;
}

const cancelButtonOf = (card) =>
  within(card).queryByRole("button", { name: /^Cancel booking MH-/ });

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
  fetchSlotsByDate.mockResolvedValue([SLOT]);
});

describe("StaffBookings – cancel a booking on behalf of a hiker (MH-08)", () => {
  it("shows Cancel only on the bookings the API marks as cancellable", async () => {
    fetchStaffReservations.mockResolvedValue([
      booking(),
      //Confirmed, but its slot has ended for the server
      booking({ id: 42, cancellable: false }),
      booking({
        id: 43,
        status: "cancelled",
        cancellable: false,
        cancelledAt: CANCELLED_AT,
        cancelledBy: STAFF,
      }),
    ]);

    renderPage();

    expect(
      cancelButtonOf(await screen.findByTestId("staff-booking-41")),
    ).toBeInTheDocument();
    expect(cancelButtonOf(screen.getByTestId("staff-booking-42"))).toBeNull();
    expect(cancelButtonOf(screen.getByTestId("staff-booking-43"))).toBeNull();
  });

  it("shows when and by whom a booking was cancelled", async () => {
    fetchStaffReservations.mockResolvedValue([
      booking({
        status: "cancelled",
        cancellable: false,
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

  it("names the hiker in the confirmation and does nothing when the staff keep the booking", async () => {
    fetchStaffReservations.mockResolvedValue([booking()]);
    const user = renderPage();

    const card = await screen.findByTestId("staff-booking-41");
    await user.click(cancelButtonOf(card));

    const dialog = screen.getByRole("alertdialog", {
      name: "Cancel booking MH-41?",
    });
    expect(dialog).toHaveTextContent("Ada Lovelace");
    await user.click(
      within(dialog).getByRole("button", { name: "Keep booking" }),
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(cancelStaffReservation).not.toHaveBeenCalled();
  });

  it("cancels through the staff API and shows who cancelled and that the email was sent", async () => {
    fetchStaffReservations.mockResolvedValue([booking({ hasAllergies: true })]);
    cancelStaffReservation.mockResolvedValue(cancelledAnswer());
    const user = renderPage();

    const card = await screen.findByTestId("staff-booking-41");
    expect(card).toHaveTextContent("Allergies · special care needed");
    await cancelFromCard(user, card);

    expect(cancelStaffReservation).toHaveBeenCalledWith(41);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(card).toHaveTextContent("Cancelled");
    expect(card).toHaveTextContent(
      `Cancelled on ${formatLongDate(CANCELLED_AT)} at ${formatTime(CANCELLED_AT)} by Giulia Bianchi`,
    );
    expect(card).toHaveTextContent(
      "A cancellation email has been sent to ada@example.com.",
    );
    //A cancelled booking no longer needs the allergy alert, nor a Cancel button
    expect(card).not.toHaveTextContent("Allergies · special care needed");
    expect(cancelButtonOf(card)).toBeNull();
    expect(document.getElementById("cancel-outcome-41")).toHaveFocus();
  });

  it("says no email was sent for a temporary hiker", async () => {
    fetchStaffReservations.mockResolvedValue([
      booking({ hiker: temporaryHiker }),
    ]);
    cancelStaffReservation.mockResolvedValue(
      cancelledAnswer({ confirmationSent: false }),
    );
    const user = renderPage();

    const card = await screen.findByTestId("staff-booking-41");
    await cancelFromCard(user, card);

    expect(card).toHaveTextContent(
      "No email was sent: the hiker has no email address.",
    );
  });

  it("says when the email to the hiker could not be sent", async () => {
    fetchStaffReservations.mockResolvedValue([booking()]);
    cancelStaffReservation.mockResolvedValue(
      cancelledAnswer({ confirmationSent: false }),
    );
    const user = renderPage();

    const card = await screen.findByTestId("staff-booking-41");
    await cancelFromCard(user, card);

    expect(card).toHaveTextContent(
      "The cancellation email to ada@example.com could not be sent.",
    );
  });

  it("keeps the cancelled booking in the list even when only confirmed bookings are shown", async () => {
    fetchStaffReservations.mockResolvedValue([booking()]);
    cancelStaffReservation.mockResolvedValue(cancelledAnswer());
    const user = renderPage();

    await screen.findByTestId("staff-booking-41");
    await user.selectOptions(screen.getByLabelText("Status"), "confirmed");
    const card = await screen.findByTestId("staff-booking-41");
    const callsBefore = fetchStaffReservations.mock.calls.length;

    await cancelFromCard(user, card);

    expect(screen.getByTestId("staff-booking-41")).toHaveTextContent(
      "Cancelled",
    );
    expect(fetchStaffReservations).toHaveBeenCalledTimes(callsBefore);
  });

  it("explains a refusal and reloads the list behind the dialog", async () => {
    fetchStaffReservations
      .mockResolvedValueOnce([booking()])
      //Someone else cancelled it meanwhile
      .mockResolvedValueOnce([
        booking({
          status: "cancelled",
          cancellable: false,
          cancelledAt: CANCELLED_AT,
          cancelledBy: STAFF,
        }),
      ]);
    cancelStaffReservation.mockRejectedValue(
      Object.assign(new Error("The booking is already cancelled."), {
        status: 409,
        code: "RESERVATION_CANCELLED",
      }),
    );
    const user = renderPage();

    const dialog = await cancelFromCard(
      user,
      await screen.findByTestId("staff-booking-41"),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Booking MH-41 has already been cancelled.",
    );
    expect(fetchStaffReservations).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(screen.getByTestId("staff-booking-41")).toHaveTextContent(
        "by Giulia Bianchi",
      ),
    );
    //The silent reload does not show the loading state nor an email result
    expect(screen.getByTestId("staff-booking-41")).not.toHaveTextContent(
      "Booking cancelled.",
    );
  });
});
