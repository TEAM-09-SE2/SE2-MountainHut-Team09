import { render, screen } from "@testing-library/react";
import CancelOutcome from "../../../src/components/booking/CancelOutcome";

//MH-08: the message shown in the card of a booking just cancelled
describe("CancelOutcome", () => {
  it("tells the hiker the email was sent to their address", () => {
    render(<CancelOutcome emailSent email="anna@example.com" />);

    expect(screen.getByText(/Booking cancelled\./)).toBeInTheDocument();
    expect(
      screen.getByText(/A cancellation email has been sent to/),
    ).toHaveTextContent("anna@example.com");
  });

  it("falls back to 'your email address' when the hiker's email is not known", () => {
    render(<CancelOutcome emailSent email={null} />);

    expect(screen.getByText(/sent to your email address/)).toBeInTheDocument();
  });

  it("tells the hiker when the email could not be sent", () => {
    render(<CancelOutcome emailSent={false} email="anna@example.com" />);

    expect(
      screen.getByText(/We could not send you the cancellation email\./),
    ).toBeInTheDocument();
  });

  it("can receive the focus, so the page can move it there after cancelling", () => {
    render(<CancelOutcome id="cancel-outcome-31" emailSent email={null} />);

    const outcome = document.getElementById("cancel-outcome-31");
    expect(outcome).toHaveAttribute("tabindex", "-1");
  });
});
