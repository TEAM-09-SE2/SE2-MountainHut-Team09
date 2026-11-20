import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CancelBookingDialog from "../../../src/components/booking/CancelBookingDialog";
import { formatLongDate } from "../../../src/utils/bookingFormat";

const BOOKING = {
  id: 31,
  partySize: 4,
  slot: {
    startAt: "2030-11-20T11:00:00.000Z",
    endAt: "2030-11-20T12:00:00.000Z",
  },
};

//An error as thrown by reservationApi for an HTTP answer
const apiError = (status, code, message = "Refused") =>
  Object.assign(new Error(message), { status, code });

function renderDialog(props = {}) {
  const handlers = {
    cancelBooking: vi
      .fn()
      .mockResolvedValue({ id: 31, confirmationSent: true }),
    onCancelled: vi.fn(),
    onRefused: vi.fn(),
    onClose: vi.fn(),
  };
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <CancelBookingDialog booking={BOOKING} {...handlers} {...props} />
    </MemoryRouter>,
  );
  const dialog = screen.getByRole("alertdialog");
  return { user, dialog, view, ...handlers, ...props };
}

const keepButton = (dialog) =>
  within(dialog).getByRole("button", { name: "Keep booking" });
const confirmButton = (dialog) =>
  within(dialog).getByRole("button", { name: "Cancel booking" });

describe("CancelBookingDialog (MH-08)", () => {
  it("asks for confirmation with the booking reference, the slot and the party", () => {
    const { dialog } = renderDialog({ hikerName: "Ada Lovelace" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByRole("heading", { name: "Cancel booking MH-31?" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Ada Lovelace");
    expect(dialog).toHaveTextContent(formatLongDate(BOOKING.slot.startAt));
    expect(dialog).toHaveTextContent("12:00 – 13:00");
    expect(dialog).toHaveTextContent("4 people");
    expect(dialog).toHaveTextContent(
      "The seats will be released for other guests. This cannot be undone.",
    );
  });

  it("starts with the focus on 'Keep booking', so Enter never cancels by mistake", () => {
    const { dialog } = renderDialog();

    expect(keepButton(dialog)).toHaveFocus();
  });

  it("keeps the booking with 'Keep booking', Escape or a click outside", async () => {
    const { user, dialog, cancelBooking, onClose } = renderDialog();

    await user.click(keepButton(dialog));
    await user.keyboard("{Escape}");
    fireEvent.mouseDown(dialog.parentElement);

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it("does not close on a click inside the dialog", () => {
    const { dialog, onClose } = renderDialog();

    fireEvent.mouseDown(dialog);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the focus inside the dialog with Tab and Shift+Tab", async () => {
    const { user, dialog } = renderDialog();

    await user.tab();
    expect(confirmButton(dialog)).toHaveFocus();
    await user.tab();
    expect(keepButton(dialog)).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton(dialog)).toHaveFocus();
  });

  it("cancels the booking and passes the API answer to the page", async () => {
    const result = { id: 31, status: "cancelled", confirmationSent: true };
    const cancelBooking = vi.fn().mockResolvedValue(result);
    const { user, dialog, onCancelled } = renderDialog({ cancelBooking });

    await user.click(confirmButton(dialog));

    expect(cancelBooking).toHaveBeenCalledWith(31);
    expect(onCancelled).toHaveBeenCalledWith(BOOKING, result);
  });

  it("cannot be closed or confirmed twice while the request runs", async () => {
    let answer;
    const cancelBooking = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { user, dialog, onClose, onCancelled } = renderDialog({
      cancelBooking,
    });

    await user.click(confirmButton(dialog));

    const busyButton = within(dialog).getByRole("button", {
      name: /Cancelling/,
    });
    expect(busyButton).toBeDisabled();
    expect(keepButton(dialog)).toBeDisabled();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement);
    fireEvent.click(busyButton);
    expect(onClose).not.toHaveBeenCalled();
    expect(cancelBooking).toHaveBeenCalledTimes(1);

    answer({ id: 31, confirmationSent: true });
    await vi.waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["RESERVATION_CANCELLED", 409, "Booking MH-31 has already been cancelled."],
    [
      "SLOT_ENDED",
      422,
      "Booking MH-31 can no longer be cancelled: its slot has already ended.",
    ],
    ["RESERVATION_NOT_FOUND", 404, "Booking MH-31 could not be found."],
  ])(
    "explains a %s refusal, offers only 'Close' and asks the page to reload",
    async (code, status, message) => {
      const cancelBooking = vi.fn().mockRejectedValue(apiError(status, code));
      const { user, dialog, onRefused, onCancelled } = renderDialog({
        cancelBooking,
      });

      await user.click(confirmButton(dialog));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        message,
      );
      expect(
        within(dialog).queryByRole("button", { name: "Cancel booking" }),
      ).toBeNull();
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toHaveFocus();
      expect(dialog).not.toHaveTextContent("This cannot be undone.");
      expect(onRefused).toHaveBeenCalledWith(BOOKING);
      expect(onCancelled).not.toHaveBeenCalled();
    },
  );

  it("asks to log in again when the session has expired, without reloading the list", async () => {
    const cancelBooking = vi
      .fn()
      .mockRejectedValue(apiError(401, "NOT_AUTHENTICATED"));
    const { user, dialog, onRefused } = renderDialog({ cancelBooking });

    await user.click(confirmButton(dialog));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Your session has expired. Log in again to cancel the booking.",
    );
    expect(
      within(dialog).getByRole("link", { name: "Log in" }),
    ).toHaveAttribute("href", "/login");
    expect(onRefused).not.toHaveBeenCalled();
  });

  it("lets the user try again after a network error", async () => {
    const cancelBooking = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ id: 31, confirmationSent: true });
    const { user, dialog, onCancelled, onRefused } = renderDialog({
      cancelBooking,
    });

    await user.click(confirmButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "We could not reach the server. Check your connection and try again.",
    );
    expect(keepButton(dialog)).toHaveFocus();
    expect(onRefused).not.toHaveBeenCalled();

    await user.click(confirmButton(dialog));

    expect(cancelBooking).toHaveBeenCalledTimes(2);
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("shows a generic message for a server error and the API message for other errors", async () => {
    const cancelBooking = vi
      .fn()
      .mockRejectedValueOnce(apiError(500, "INTERNAL_ERROR", "db down"))
      .mockRejectedValueOnce(
        apiError(
          403,
          "PASSWORD_CHANGE_REQUIRED",
          "Change your password first.",
        ),
      );
    const { user, dialog } = renderDialog({ cancelBooking });

    await user.click(confirmButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side. Please try again.",
    );

    await user.click(confirmButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Change your password first.",
    );
  });

  it("makes the page behind inert while open and gives the focus back when closed", async () => {
    //The app is mounted in #root, as in index.html; the dialog is rendered outside it
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    const opener = document.createElement("button");
    root.appendChild(opener);
    opener.focus();

    const { view } = renderDialog();

    expect(root).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    view.unmount();

    expect(root).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
    root.remove();
  });

  it("moves the focus to the page title when the opener is gone", () => {
    const title = document.createElement("h1");
    title.tabIndex = -1;
    const opener = document.createElement("button");
    document.body.append(title, opener);
    opener.focus();
    const returnFocusRef = { current: title };

    const { view } = renderDialog({ returnFocusRef });
    //After a cancellation the card no longer has its "Cancel" button
    opener.remove();
    view.unmount();

    expect(title).toHaveFocus();
    title.remove();
  });
});
