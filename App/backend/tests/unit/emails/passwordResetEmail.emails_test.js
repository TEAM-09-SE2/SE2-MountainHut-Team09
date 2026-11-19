import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import emailSender from "../../../src/emails/emailSender.js";
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