import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render } from "react-email";

import emailSender from "../../../src/emails/emailSender.js";
import PasswordResetEmail from "../../../src/emails/passwordResetEmail.jsx";
import passwordResetEmailService from "../../../src/services/passwordResetEmail.service.js";

const originalClientUrl = process.env.CLIENT_URL;

afterEach(() => {
  mock.reset();
  if (originalClientUrl === undefined) {
    delete process.env.CLIENT_URL;
  } else {
    process.env.CLIENT_URL = originalClientUrl;
  }
});

const validProps = () => ({
  firstName: "Anna",
  resetUrl: "https://hut.example.com/reset-password?token=abc123",
});

const renderHtml = (props) => render(createElement(PasswordResetEmail, props));
const renderText = (props) =>
  render(createElement(PasswordResetEmail, props), { plainText: true });

function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("PasswordResetEmail component unit tests", () => {
  it("greets the user and explains the reset link expiry", async () => {
    const text = visibleText(await renderHtml(validProps()));

    assert.match(text, /Reset your password/);
    assert.match(text, /Hello, Anna!/);
    assert.match(text, /expires in 24 hours/);
    assert.match(text, /can only be used once/);
  });

  it("includes the reset URL in both the button and fallback link", async () => {
    const props = validProps();
    const html = await renderHtml(props);
    const text = await renderText(props);

    assert.equal(
      (html.match(/href="https:\/\/hut\.example\.com\/reset-password\?token=abc123"/g) || [])
        .length,
      2,
    );
    assert.match(html, /<a[^>]*>Reset password<\/a>/);
    assert.match(text, /https:\/\/hut\.example\.com\/reset-password\?token=abc123/);
  });

  it("shows the inbox preview and security notice", async () => {
    const html = await renderHtml(validProps());
    const text = await renderText(validProps());

    assert.match(html, /Reset your Skyreach password/);
    assert.match(text, /If you did not request a password reset/);
    assert.match(text, /your current password will remain unchanged/);
  });

  it("escapes HTML in the first name and reset URL", async () => {
    const props = {
      firstName: '<img src="x" onerror="alert(1)">Anna',
      resetUrl: 'https://hut.example.com/reset-password?next=<b>&token=abc',
    };

    const html = await renderHtml(props);

    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /<b>/);
    assert.match(html, /&lt;img src=&quot;x&quot; onerror=&quot;alert\(1\)&quot;&gt;Anna/);
    assert.match(html, /&lt;b&gt;/);
  });

  it("rejects missing, blank or non-string required props", async () => {
    for (const field of ["firstName", "resetUrl"]) {
      for (const value of [undefined, null, "", "   ", 42]) {
        await assert.rejects(
          renderHtml({ ...validProps(), [field]: value }),
          {
            name: "Error",
            message: `Missing required password reset email fields: ${field}`,
          },
        );
      }
    }
  });

  it("lists every missing required prop in one error", async () => {
    await assert.rejects(
      renderHtml({}),
      {
        name: "Error",
        message:
          "Missing required password reset email fields: firstName, resetUrl",
      },
    );
  });

  it("shows the current year in the footer", async () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2031-03-01T10:00:00Z") });

    const text = visibleText(await renderHtml(validProps()));

    assert.match(text, /© 2031 Skyreach\. All rights reserved\./);
  });
});

describe("passwordResetEmail service unit tests (MH-07)", () => {
  it("builds the reset URL from CLIENT_URL, renders the email, and sends it", async () => {
    process.env.CLIENT_URL = "https://hut.example.com";
    const sendMock = mock.method(emailSender, "send", async () => {});

    const sent = await passwordResetEmailService.sendPasswordResetEmail(
      { id: 12, email: "anna@example.com", firstName: "Anna" },
      "abc123token",
    );

    assert.equal(sent, true);
    assert.equal(sendMock.mock.callCount(), 1);
    const mail = sendMock.mock.calls[0].arguments[0];
    assert.equal(mail.to, "anna@example.com");
    assert.equal(mail.subject, "Reset your password");
    assert.match(mail.html, /https:\/\/hut\.example\.com\/reset-password\?token=abc123token/);
    assert.match(mail.text, /https:\/\/hut\.example\.com\/reset-password\?token=abc123token/);
  });

  it("handles CLIENT_URL with a trailing slash without duplicating slashes", async () => {
    process.env.CLIENT_URL = "https://hut.example.com/";
    const sendMock = mock.method(emailSender, "send", async () => {});

    const sent = await passwordResetEmailService.sendPasswordResetEmail(
      { id: 12, email: "anna@example.com", firstName: "Anna" },
      "tok999",
    );

    assert.equal(sent, true);
    const mail = sendMock.mock.calls[0].arguments[0];
    assert.match(mail.text, /https:\/\/hut\.example\.com\/reset-password\?token=tok999/);
  });

  it("returns false without throwing when CLIENT_URL is missing or emailSender fails", async () => {
    mock.method(console, "error", () => {});
    delete process.env.CLIENT_URL;

    const missingEnvResult = await passwordResetEmailService.sendPasswordResetEmail(
      { id: 12, email: "anna@example.com", firstName: "Anna" },
      "tok999",
    );
    assert.equal(missingEnvResult, false);

    process.env.CLIENT_URL = "https://hut.example.com";
    mock.method(emailSender, "send", async () => {
      throw new Error("SMTP unreachable");
    });

    const smtpFailResult = await passwordResetEmailService.sendPasswordResetEmail(
      { id: 12, email: "anna@example.com", firstName: "Anna" },
      "tok999",
    );
    assert.equal(smtpFailResult, false);
  });
});