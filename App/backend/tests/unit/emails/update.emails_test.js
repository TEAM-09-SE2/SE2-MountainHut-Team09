import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import reservationRepository from "../../../src/database/reservation.repository.js";
import emailSender from "../../../src/emails/emailSender.js";
import confirmationEmailService from "../../../src/services/confirmationEmail.service.js";

afterEach(() => {
  mock.reset();
});

const updateData = {
  id: 31,
  partySize: 4,
  email: "ada.lovelace@example.com",
  hikerName: "Ada Lovelace",
  startAt: new Date("2099-12-15T11:00:00.000Z"),
  endAt: new Date("2099-12-15T13:00:00.000Z"),
};

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("booking update email service", () => {
  it("sends updated reservation details to the hiker without marking a new confirmation", async () => {
    const dataMock = mock.method(
      reservationRepository,
      "getConfirmationData",
      async () => updateData,
    );
    const markSentMock = mock.method(
      reservationRepository,
      "markConfirmationSent",
      async () => {},
    );
    const sendMock = mock.method(emailSender, "send", async () => {});

    assert.equal(await confirmationEmailService.sendBookingUpdate(31), true);

    const message = sendMock.mock.calls[0].arguments[0];
    assert.deepEqual(Object.keys(message).sort(), ["html", "subject", "text", "to"]);
    assert.equal(message.to, updateData.email);
    assert.equal(message.subject, "Booking updated – MH-31");
    assert.match(visibleText(message.html), /Your reservation has been updated/i);
    assert.match(visibleText(message.html), /Booking Reference MH-31/);
    assert.match(message.text, /Your reservation has been updated/i);
    assert.equal(dataMock.mock.calls[0].arguments[0], 31);
    assert.equal(markSentMock.mock.callCount(), 0);
  });

  it("returns false and logs the error when the update email cannot be sent", async () => {
    const smtpError = new Error("SMTP unavailable");
    mock.method(
      reservationRepository,
      "getConfirmationData",
      async () => updateData,
    );
    const sendMock = mock.method(emailSender, "send", async () => {
      throw smtpError;
    });
    const consoleErrorMock = mock.method(console, "error", () => {});

    assert.equal(await confirmationEmailService.sendBookingUpdate(31), false);

    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(consoleErrorMock.mock.callCount(), 1);
    assert.deepEqual(consoleErrorMock.mock.calls[0].arguments, [
      "Update email for reservation 31 not sent:",
      smtpError,
    ]);
  });

  it("does not send an update email when the reservation no longer exists", async () => {
    mock.method(reservationRepository, "getConfirmationData", async () => null);
    const sendMock = mock.method(emailSender, "send", async () => {});

    assert.equal(await confirmationEmailService.sendBookingUpdate(404), false);
    assert.equal(sendMock.mock.callCount(), 0);
  });
});
