import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationRepository from "../../../src/database/reservation.repository.js";
import emailSender from "../../../src/emails/emailSender.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";

afterEach(() => {
  mock.reset();
});

const cancelledBooking = (overrides = {}) => ({
  id: 31,
  partySize: 4,
  email: "ada.lovelace@example.com",
  hikerName: "Ada Lovelace",
  startAt: new Date("2099-12-15T11:00:00.000Z"),
  endAt: new Date("2099-12-15T13:00:00.000Z"),
  ...overrides,
});

const REQUIREMENTS = [
  { id: 101, peopleCount: 2, hasAllergies: false, description: "Vegetarians" },
  { id: 102, peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
];

function mockDependencies({ data = cancelledBooking(), requirements = REQUIREMENTS } = {}) {
  return {
    getDataMock: mock.method(reservationRepository, "getConfirmationData", async () => data),
    getRequirementsMock: mock.method(reservationRepository, "getRequirementsByReservationId", async () => requirements),
    markSentMock: mock.method(reservationRepository, "markConfirmationSent", async () => {}),
    sendMock: mock.method(emailSender, "send", async () => {}),
    consoleErrorMock: mock.method(console, "error", () => {}),
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

describe("sendBookingCancellation_unit (MH-08)", () => {
  // Verifies the hiker of the booking gets one email, in HTML and plain text, with the documented subject.
  it("emails the hiker with the subject Booking cancelled – MH-<id>", async () => {
    const { getDataMock, sendMock } = mockDependencies();

    const result = await confirmationEmailService.sendBookingCancellation(31);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.equal(result, true);
    assert.deepEqual(getDataMock.mock.calls[0].arguments, [31]);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.deepEqual(Object.keys(message).sort((a, b) => a.localeCompare(b)), ["html", "subject", "text", "to"]);
    assert.equal(message.to, "ada.lovelace@example.com");
    assert.equal(message.subject, "Booking cancelled – MH-31");
    assert.doesNotMatch(message.text, /<[a-z]/i);
  });

  // Verifies the email says the reservation is cancelled and not that it is confirmed or updated.
  it("says the reservation has been cancelled", async () => {
    const { sendMock } = mockDependencies();

    await confirmationEmailService.sendBookingCancellation(31);
    const message = sendMock.mock.calls[0].arguments[0];
    const html = visibleText(message.html);

    assert.match(message.html, /<h1[^>]*>Your reservation has been cancelled<\/h1>/);
    assert.match(html, /Your booking has been cancelled\. Reference: MH-31/);
    assert.match(message.text, /Your reservation has been cancelled/);
    assert.doesNotMatch(html, /is confirmed|has been updated/i);
    assert.doesNotMatch(message.text, /is confirmed|has been updated/i);
  });

  // Verifies the email carries the reference, the slot in the hut's time, the party size, the requirements and the hiker's name (issue #24).
  it("lists the details of the cancelled booking", async () => {
    const { sendMock } = mockDependencies();

    await confirmationEmailService.sendBookingCancellation(31);
    const message = sendMock.mock.calls[0].arguments[0];
    const html = visibleText(message.html);

    assert.match(html, /Hello, Ada Lovelace!/);
    assert.match(html, /Hiker Ada Lovelace /);
    assert.match(html, /Booking Reference MH-31 /);
    assert.match(html, /Date & Time 15 December 2099 - from 12:00 to 14:00 /);
    assert.match(html, /Party size 4 people /);
    assert.match(html, /1 × ALLERGY: Peanut allergy.*2 × Vegetarians/);
    assert.match(message.text, /Booking Reference\s+MH-31/);
    assert.match(message.text, /Date & Time\s+15 December 2099 - from 12:00 to 14:00/);
    assert.match(message.text, /Party size\s+4 people/);
  });

  // Verifies a summer slot is shown in the hut's summer time (UTC+2).
  it("shows a summer slot in the hut's summer time", async () => {
    const { sendMock } = mockDependencies({
      data: cancelledBooking({ startAt: new Date("2099-07-20T10:00:00.000Z"), endAt: new Date("2099-07-20T11:30:00.000Z") }),
    });

    await confirmationEmailService.sendBookingCancellation(31);

    assert.match(visibleText(sendMock.mock.calls[0].arguments[0].html), /Date & Time 20 July 2099 - from 12:00 to 13:30 /);
  });

  // Verifies the email contains no table numbers (issue #24).
  it("leaves the table numbers out of the email", async () => {
    const { sendMock } = mockDependencies();

    await confirmationEmailService.sendBookingCancellation(31);
    const message = sendMock.mock.calls[0].arguments[0];

    assert.doesNotMatch(visibleText(message.html), /table/i);
    assert.doesNotMatch(message.text, /table/i);
  });

  // Verifies the requirements row is left out when the booking had none.
  it("leaves the requirements out when the booking had none", async () => {
    const { sendMock } = mockDependencies({ requirements: [] });

    await confirmationEmailService.sendBookingCancellation(31);

    assert.doesNotMatch(visibleText(sendMock.mock.calls[0].arguments[0].html), /Party requirements/);
  });

  // Verifies the cancellation email does not change confirmation_sent_at, which belongs to the booking confirmation.
  it("does not mark a new confirmation", async () => {
    const { markSentMock } = mockDependencies();

    await confirmationEmailService.sendBookingCancellation(31);

    assert.equal(markSentMock.mock.callCount(), 0);
  });

  // Verifies a hiker without an email (temporary hiker, MH-07) gets nothing and the result is false.
  it("returns false without sending anything when the hiker has no email", async () => {
    const { sendMock, consoleErrorMock } = mockDependencies({ data: cancelledBooking({ email: null }) });

    const result = await confirmationEmailService.sendBookingCancellation(31);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(consoleErrorMock.mock.callCount(), 0);
  });

  // Verifies a booking that cannot be found sends nothing and returns false.
  it("returns false without sending anything when the booking is not found", async () => {
    const { sendMock } = mockDependencies({ data: null });

    const result = await confirmationEmailService.sendBookingCancellation(404);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  // Verifies an SMTP failure is logged instead of thrown, so the cancellation is never undone.
  it("returns false and logs the error when the email cannot be sent", async () => {
    const { sendMock, consoleErrorMock } = mockDependencies();
    const smtpError = new Error("SMTP unavailable");
    sendMock.mock.mockImplementation(async () => { throw smtpError; });

    const result = await confirmationEmailService.sendBookingCancellation(31);

    assert.equal(result, false);
    assert.deepEqual(consoleErrorMock.mock.calls[0].arguments, ["Cancellation email for reservation 31 not sent:", smtpError]);
  });

  // Verifies a database error while reading the booking is logged instead of thrown, and no email is sent.
  it("returns false and logs the error when the booking data cannot be read", async () => {
    const { getDataMock, sendMock, consoleErrorMock } = mockDependencies();
    const dbError = new Error("connection refused");
    getDataMock.mock.mockImplementation(async () => { throw dbError; });

    const result = await confirmationEmailService.sendBookingCancellation(31);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.deepEqual(consoleErrorMock.mock.calls[0].arguments, ["Cancellation email for reservation 31 not sent:", dbError]);
  });

  // Verifies booking data the template refuses is logged and returns false, without sending a broken email.
  it("returns false without sending anything when the email cannot be rendered", async () => {
    const { sendMock, consoleErrorMock } = mockDependencies({ data: cancelledBooking({ partySize: 0 }) });

    const result = await confirmationEmailService.sendBookingCancellation(31);

    assert.equal(result, false);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
  });

  // Verifies the confirmation (MH-03) and update (MH-06) emails built by the same function still say confirmed and updated, never cancelled.
  it("keeps the wording of the confirmation and update emails", async () => {
    const { sendMock } = mockDependencies();

    await confirmationEmailService.sendBookingConfirmation(31);
    await confirmationEmailService.sendBookingUpdate(31);
    const [confirmation, update] = sendMock.mock.calls.map((call) => call.arguments[0]);

    assert.equal(confirmation.subject, "Booking confirmed – MH-31");
    assert.match(confirmation.html, /<h1[^>]*>Your reservation is confirmed<\/h1>/);
    assert.doesNotMatch(confirmation.text, /cancelled/i);
    assert.equal(update.subject, "Booking updated – MH-31");
    assert.match(update.html, /<h1[^>]*>Your reservation has been updated<\/h1>/);
    assert.doesNotMatch(update.text, /cancelled/i);
  });
});
