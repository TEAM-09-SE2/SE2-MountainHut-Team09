import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render } from "react-email";

import BookingConfirmationEmail from "../../../src/emails/confirmationEmails.jsx";
import { visibleText } from "../../helpers/emailText.js";

const cancelledProps = (overrides = {}) => ({
  bookingReference: "MH-31",
  dateTimeSlot: "15 December 2099 - from 12:00 to 14:00",
  partySize: 4,
  hikerName: "Ada Lovelace",
  partyRequirements: ["1 × ALLERGY: Peanut allergy", "2 × Vegetarians"],
  isCancelled: true,
  ...overrides,
});

const renderHtml = (props) => render(createElement(BookingConfirmationEmail, props));
const renderText = (props) => render(createElement(BookingConfirmationEmail, props), { plainText: true });

describe("BookingConfirmationEmail cancelled variant (MH-08)", () => {
  // Verifies the heading says the reservation has been cancelled.
  it("says in the heading that the reservation has been cancelled", async () => {
    const html = await renderHtml(cancelledProps());

    assert.match(html, /<h1[^>]*>Your reservation has been cancelled<\/h1>/);
    assert.doesNotMatch(visibleText(html), /Your reservation is confirmed|Your reservation has been updated/);
  });

  // Verifies the inbox preview says the booking is cancelled and carries the reference.
  it("puts the cancellation and the booking reference in the inbox preview", async () => {
    const text = visibleText(await renderHtml(cancelledProps()));

    assert.match(text, /Your booking has been cancelled\. Reference: MH-31/);
    assert.doesNotMatch(text, /Your booking is confirmed\./);
  });

  // Verifies the hiker is told the seats have been released instead of being welcomed.
  it("tells the hiker the seats have been released", async () => {
    const text = visibleText(await renderHtml(cancelledProps()));

    assert.match(text, /Hello, Ada Lovelace!/);
    assert.match(text, /the seats have been released/);
    assert.doesNotMatch(text, /We look forward to welcoming you/);
  });

  // Verifies the cancelled booking keeps every detail required by issue #24 next to its label.
  it("still shows every detail of the cancelled booking", async () => {
    const text = visibleText(await renderHtml(cancelledProps()));

    assert.match(text, /Booking Reference MH-31 /);
    assert.match(text, /Hiker Ada Lovelace /);
    assert.match(text, /Date & Time 15 December 2099 - from 12:00 to 14:00 /);
    assert.match(text, /Party size 4 people /);
    assert.match(text, /Party requirements 1 × ALLERGY: Peanut allergy 2 × Vegetarians/);
  });

  // Verifies the plain-text version says the same as the HTML version.
  it("says the same in the plain-text version", async () => {
    const text = await renderText(cancelledProps());

    assert.match(text, /Your reservation has been cancelled/);
    assert.match(text, /the seats have been released/);
    assert.match(text, /Booking Reference\s+MH-31/);
    assert.match(text, /Party size\s+4 people/);
    assert.doesNotMatch(text, /<[a-z]/i);
  });

  // Verifies the confirmation email is unchanged when the cancelled flag is not set.
  it("keeps the confirmation wording when the booking is not cancelled", async () => {
    const html = await renderHtml(cancelledProps({ isCancelled: undefined }));

    assert.match(html, /<h1[^>]*>Your reservation is confirmed<\/h1>/);
    assert.doesNotMatch(visibleText(html), /cancelled/i);
  });

  // Verifies the update email is unchanged when only the update flag is set.
  it("keeps the update wording for a changed booking", async () => {
    const html = await renderHtml(cancelledProps({ isCancelled: false, isUpdate: true }));

    assert.match(html, /<h1[^>]*>Your reservation has been updated<\/h1>/);
    assert.doesNotMatch(visibleText(html), /cancelled/i);
  });

  // Verifies the same data checks apply to the cancelled email as to the confirmation.
  it("refuses to render a cancelled email with missing booking data", async () => {
    await assert.rejects(renderHtml(cancelledProps({ hikerName: "" })), /hikerName/);
    await assert.rejects(renderHtml(cancelledProps({ partySize: 0 })), /partySize/);
    await assert.rejects(renderHtml(cancelledProps({ partySize: 2.5 })), /partySize/);
    await assert.rejects(renderHtml(cancelledProps({ partyRequirements: [" "] })), /partyRequirements/);
  });
});
