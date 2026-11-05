import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render } from "@react-email/render";

import BookingConfirmationEmail from "../../../src/emails/confirmationEmails.jsx";

afterEach(() => {
  mock.reset();
});

const validProps = () => ({
  bookingReference: "MH-42",
  dateTimeSlot: "15 December 2026 - from 12:00 to 14:00",
  partySize: 4,
  hikerName: "Ada Lovelace",
});

const renderHtml = (props) => render(createElement(BookingConfirmationEmail, props));
const renderText = (props) => render(createElement(BookingConfirmationEmail, props), { plainText: true });

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("BookingConfirmationEmail_unit", () => {
  // Verifies the email shows the booking reference, hiker name, date and time slot and party size, each next to its label.
  it("shows every booking detail next to its label", async () => {
    const text = visibleText(await renderHtml(validProps()));

    assert.match(text, /Booking Reference MH-42 /);
    assert.match(text, /Hiker Ada Lovelace /);
    assert.match(text, /Date & Time 15 December 2026 - from 12:00 to 14:00 /);
    assert.match(text, /Party size 4 people /);
  });

  // Verifies the hiker is greeted by name under a heading saying the reservation is confirmed.
  it("greets the hiker by name and says the reservation is confirmed", async () => {
    const html = await renderHtml(validProps());

    assert.match(html, /<h1[^>]*>Your reservation is confirmed<\/h1>/);
    assert.match(visibleText(html), /Hello, Ada Lovelace!/);
  });

  // Verifies the inbox preview line carries the booking reference.
  it("puts the booking reference in the inbox preview", async () => {
    const html = await renderHtml(validProps());

    assert.match(visibleText(html), /Your booking is confirmed\. Reference: MH-42/);
  });

  // Verifies the party size reads "person" for a party of one and "people" for larger parties.
  it("writes person for a party of one and people for larger parties", async () => {
    const cases = [[1, "1 person"], [2, "2 people"], [12, "12 people"]];

    for (const [partySize, expected] of cases) {
      const text = visibleText(await renderHtml({ ...validProps(), partySize }));
      assert.match(text, new RegExp(`Party size ${expected} `));
    }
  });

  // Verifies the plain-text version contains every booking detail and no markup.
  it("includes every booking detail in the plain-text version", async () => {
    const text = await renderText(validProps());

    assert.match(text, /Booking Reference\s+MH-42/);
    assert.match(text, /Hiker\s+Ada Lovelace/);
    assert.match(text, /Date & Time\s+15 December 2026 - from 12:00 to 14:00/);
    assert.match(text, /Party size\s+4 people/);
    assert.match(text, /Hello, Ada Lovelace!/);
    assert.doesNotMatch(text, /<[a-z!/]/i);
  });

  // Verifies table numbers are never shown, even when the assigned tables are passed in (issue #24).
  it("does not show table numbers even when the assigned tables are passed", async () => {
    const props = { ...validProps(), assignedTables: [{ tableNumber: 3, seats: 2 }, { tableNumber: 7, seats: 2 }] };

    assert.doesNotMatch(visibleText(await renderHtml(props)), /table/i);
    assert.doesNotMatch(await renderText(props), /table/i);
  });

  // Verifies HTML inside the booking values is escaped instead of becoming part of the email markup.
  it("escapes HTML in the booking values", async () => {
    const html = await renderHtml({ ...validProps(), hikerName: '<img src="x" onerror="alert(1)">Ada', bookingReference: "<b>MH-42</b>" });

    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /<b>/);
    assert.match(html, /&lt;img src=&quot;x&quot; onerror=&quot;alert\(1\)&quot;&gt;Ada/);
    assert.match(html, /&lt;b&gt;MH-42&lt;\/b&gt;/);
  });

  // Verifies a missing, blank or non-string booking reference, date and time slot or hiker name is rejected, naming the field.
  it("rejects a missing, blank or non-string required text field", async () => {
    for (const field of ["bookingReference", "dateTimeSlot", "hikerName"]) {
      for (const value of [undefined, null, "", "   ", 42]) {
        await assert.rejects(renderHtml({ ...validProps(), [field]: value }), { name: "Error", message: `Missing required booking confirmation fields: ${field}` });
      }
    }
  });

  // Verifies every missing text field is listed in a single error.
  it("lists every missing text field in one error", async () => {
    await assert.rejects(renderHtml({ partySize: 4 }), { name: "Error", message: "Missing required booking confirmation fields: bookingReference, dateTimeSlot, hikerName" });
  });

  // Verifies party sizes that are not positive integers are rejected.
  it("rejects party sizes that are not positive integers", async () => {
    for (const partySize of [undefined, null, 0, -2, 2.5, "4", Number.NaN]) {
      await assert.rejects(renderHtml({ ...validProps(), partySize }), { name: "Error", message: "partySize must be a positive integer" });
    }
  });

  // Verifies the copyright line shows the year the email is rendered.
  it("shows the current year in the footer", async () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2031-03-01T10:00:00Z") });

    const text = visibleText(await renderHtml(validProps()));

    assert.match(text, /© 2031 Skyreach\. All rights reserved\./);
  });
});
