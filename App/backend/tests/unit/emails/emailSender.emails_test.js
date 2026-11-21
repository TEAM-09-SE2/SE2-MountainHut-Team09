import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

const SMTP_VARIABLES = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"];
let originalEnv;

beforeEach(() => {
  originalEnv = Object.fromEntries(SMTP_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of SMTP_VARIABLES) delete process.env[name];
});

afterEach(() => {
  mock.reset();

  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

const email = () => ({ to: "ada.lovelace@example.com", subject: "Booking confirmed – MH-42", html: "<p>Hello, Ada Lovelace!</p>", text: "Hello, Ada Lovelace!" });

async function loadEmailSender() {
  const module = await import(`../../../src/emails/emailSender.js?${randomUUID()}`);
  return module.default;
}

function mockTransport(sendMail = async () => ({ messageId: "<1@example.com>" })) {
  const sendMailMock = mock.fn(sendMail);
  const createTransportMock = mock.method(nodemailer, "createTransport", () => ({ sendMail: sendMailMock }));
  return { createTransportMock, sendMailMock };
}

describe("emailSender.send_unit", () => {
  // Verifies the email goes over SMTP with the SMTP_* settings, the documented timeouts, no login without SMTP_USER, and MAIL_FROM as sender.
  it("sends the email over SMTP with the SMTP_* settings and MAIL_FROM as sender", async () => {
    Object.assign(process.env, { SMTP_HOST: "localhost", SMTP_PORT: "1025", SMTP_SECURE: "false", SMTP_USER: "", MAIL_FROM: "Mountain Hut <noreply@mountainhut.local>" });
    const { createTransportMock, sendMailMock } = mockTransport();
    const emailSender = await loadEmailSender();

    await emailSender.send(email());

    assert.equal(createTransportMock.mock.callCount(), 1);
    assert.deepEqual(createTransportMock.mock.calls[0].arguments, [{
      host: "localhost",
      port: 1025,
      secure: false,
      auth: undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    }]);
    assert.equal(sendMailMock.mock.callCount(), 1);
    assert.deepEqual(sendMailMock.mock.calls[0].arguments, [{ from: "Mountain Hut <noreply@mountainhut.local>", ...email() }]);
  });

  // Verifies a provider that needs a login, like the project Gmail account over TLS, gets SMTP_USER and SMTP_PASSWORD as credentials.
  it("logs in with SMTP_USER and SMTP_PASSWORD over TLS when they are set", async () => {
    Object.assign(process.env, { SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "hut@example.com", SMTP_PASSWORD: "app-password", MAIL_FROM: "Mountain Hut <hut@example.com>" });
    const { createTransportMock } = mockTransport();
    const emailSender = await loadEmailSender();

    await emailSender.send(email());

    const options = createTransportMock.mock.calls[0].arguments[0];
    assert.equal(options.host, "smtp.example.com");
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.deepEqual(options.auth, { user: "hut@example.com", pass: "app-password" });
  });

  // Verifies the Mailpit port 1025 is used when SMTP_PORT is not set.
  it("uses port 1025 when SMTP_PORT is not set", async () => {
    process.env.SMTP_HOST = "localhost";
    const { createTransportMock } = mockTransport();
    const emailSender = await loadEmailSender();

    await emailSender.send(email());

    assert.equal(createTransportMock.mock.calls[0].arguments[0].port, 1025);
    assert.equal(createTransportMock.mock.calls[0].arguments[0].secure, false);
  });

  // Verifies the SMTP transport is created on the first email and reused for the next ones.
  it("creates the SMTP transport once and reuses it for every email", async () => {
    process.env.SMTP_HOST = "localhost";
    const { createTransportMock, sendMailMock } = mockTransport();
    const emailSender = await loadEmailSender();

    await emailSender.send(email());
    await emailSender.send({ ...email(), to: "grace.hopper@example.com" });

    assert.equal(createTransportMock.mock.callCount(), 1);
    assert.equal(sendMailMock.mock.callCount(), 2);
    assert.equal(sendMailMock.mock.calls[1].arguments[0].to, "grace.hopper@example.com");
  });

  // Verifies an SMTP failure reaches the caller, so the booking can answer confirmationSent false.
  it("rejects with the SMTP error when the email cannot be sent", async () => {
    process.env.SMTP_HOST = "localhost";
    const smtpError = new Error("connect ECONNREFUSED 127.0.0.1:1025");
    mockTransport(async () => { throw smtpError; });
    const emailSender = await loadEmailSender();

    await assert.rejects(emailSender.send(email()), smtpError);
  });
});
