import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationRepository from "../../../src/database/reservation.repository.js";
import emailSender from "../../../src/emails/emailSender.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";

afterEach(() => {
  mock.reset();
});

const winterBooking = () => ({
  id: 42,
  partySize: 4,
  email: "ada.lovelace@example.com",
  hikerName: "Ada Lovelace",
  startAt: new Date("2026-12-15T11:00:00.000Z"),
  endAt: new Date("2026-12-15T13:00:00.000Z"),
  tables: [{ tableNumber: 3, seats: 2 }, { tableNumber: 7, seats: 2 }],
});

function mockDependencies(booking = winterBooking()) {
  return {
    getConfirmationDataMock: mock.method(reservationRepository, "getConfirmationData", async () => booking),
    markConfirmationSentMock: mock.method(reservationRepository, "markConfirmationSent", async () => {}),
    sendMock: mock.method(emailSender, "send", async () => {}),
  };
}

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("sendBookingConfirmation_integration", () => {
  // Verifies the hiker gets one email, in HTML and plain text, with the reference, name, date and time slot and party size, and the booking is marked as confirmed.
  it("emails the hiker every booking detail and marks the confirmation as sent", async () => {
    const { getConfirmationDataMock, markConfirmationSentMock, sendMock } = mockDependencies();

    const result = await confirmationEmailService.sendBookingConfirmation(42);
    const message = sendMock.mock.calls[0].arguments[0];
    const html = visibleText(message.html);

    assert.equal(result, true);
    assert.deepEqual(getConfirmationDataMock.mock.calls[0].arguments, [42]);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(message.to, "ada.lovelace@example.com");
    assert.equal(message.subject, "Booking confirmed – MH-42");
    assert.match(html, /Hello, Ada Lovelace!/);
    assert.match(html, /Booking Reference MH-42 /);
    assert.match(html, /Hiker Ada Lovelace /);
    assert.match(html, /Date & Time 15 December 2026 - from 12:00 to 14:00 /);
    assert.match(html, /Party size 4 people /);
    assert.match(message.text, /Booking Reference\s+MH-42/);
    assert.match(message.text, /Hiker\s+Ada Lovelace/);
    assert.match(message.text, /Date & Time\s+15 December 2026 - from 12:00 to 14:00/);
    assert.match(message.text, /Party size\s+4 people/);
    assert.deepEqual(markConfirmationSentMock.mock.calls[0].arguments, [42]);
    assert.equal(markConfirmationSentMock.mock.callCount(), 1);
  });

  // Verifies a summer slot is shown in Rome summer time (UTC+2) and not in UTC.
  it("shows a summer slot in the hut's summer time", async () => {
    const { sendMock } = mockDependencies({ ...winterBooking(), startAt: new Date("2027-07-20T10:00:00.000Z"), endAt: new Date("2027-07-20T12:00:00.000Z") });

    await confirmationEmailService.sendBookingConfirmation(42);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.match(visibleText(message.html), /Date & Time 20 July 2027 - from 12:00 to 14:00 /);
    assert.match(message.text, /Date & Time\s+20 July 2027 - from 12:00 to 14:00/);
  });

  // Verifies the assigned table numbers stay out of the email although the repository returns them (issue #24).
  it("leaves the assigned table numbers out of the email", async () => {
    const { sendMock } = mockDependencies();

    await confirmationEmailService.sendBookingConfirmation(42);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.doesNotMatch(visibleText(message.html), /table/i);
    assert.doesNotMatch(message.text, /table/i);
  });

  // Verifies a booking the template refuses to render is neither emailed nor marked as sent, and the error is logged instead of thrown.
  it("does not send or mark the confirmation when the template rejects the booking data", async () => {
    const { markConfirmationSentMock, sendMock } = mockDependencies({ ...winterBooking(), hikerName: " " });
    const consoleErrorMock = mock.method(console, "error", () => {});

    const result = await confirmationEmailService.sendBookingConfirmation(42);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markConfirmationSentMock.mock.callCount(), 0);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
    assert.equal(consoleErrorMock.mock.calls[0].arguments[1].message, "Missing required booking confirmation fields: hikerName");
  });
});
