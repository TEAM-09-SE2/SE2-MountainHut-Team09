import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import pool from "../../src/database/connection.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = "auth-e2e-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = "test";

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await pool.end();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

const createTestEmail = () => `auth-e2e-${randomUUID()}@example.com`;

const validRegistration = (email) => ({ email, password: "password123", firstName: "Ada", lastName: "Lovelace" });

async function trackTestEmail(testContext, email) {
  testContext.after(async () => {
    await pool.query("DELETE FROM app_user WHERE email = $1", [email.toLowerCase()]);
  });
}

async function sendRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function getTokenCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const token = setCookie.match(/(?:^|,\s*)token=([^;]+)/)?.[1];
  assert.ok(token);
  return { setCookie, token, cookie: `token=${token}` };
}

describe("auth end-to-end", () => {
  // Verifies the complete registration, login, authenticated profile, and logout flow against the real database.
  it("registers, authenticates, serves the profile, and logs out", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);

    const registrationResponse = await sendRequest("/register", { method: "POST", body: validRegistration(email) });
    const registeredUser = await registrationResponse.json();

    assert.equal(registrationResponse.status, 201);
    assert.equal(Number.isInteger(registeredUser.id), true);
    assert.deepEqual(registeredUser, { id: registeredUser.id, email, firstName: "Ada", lastName: "Lovelace", phone: null, role: "hiker" });
    assert.equal(Object.hasOwn(registeredUser, "password_hash"), false);
    assert.equal(Object.hasOwn(registeredUser, "salt"), false);

    const loginResponse = await sendRequest("/login", { method: "POST", body: { email, password: "password123" } });
    const loggedInUser = await loginResponse.json();
    const { setCookie, token, cookie } = getTokenCookie(loginResponse);
    const tokenPayload = jwt.verify(token, testJwtSecret);

    assert.equal(loginResponse.status, 200);
    assert.deepEqual(loggedInUser, { id: registeredUser.id, email, firstName: "Ada", lastName: "Lovelace", role: "hiker" });
    assert.deepEqual({ id: tokenPayload.id, email: tokenPayload.email, firstName: tokenPayload.firstName, lastName: tokenPayload.lastName, role: tokenPayload.role }, loggedInUser);

    const profileResponse = await sendRequest("/me", { cookie });
    const profile = await profileResponse.json();

    assert.equal(profileResponse.status, 200);
    assert.deepEqual(profile, loggedInUser);

    const logoutResponse = await sendRequest("/logout", { method: "POST", cookie });

    assert.equal(logoutResponse.status, 204);
    assert.match(logoutResponse.headers.get("set-cookie"), /token=;/);

    const profileAfterLogoutResponse = await sendRequest("/me");
    const profileAfterLogoutError = await profileAfterLogoutResponse.json();

    assert.equal(profileAfterLogoutResponse.status, 401);
    assert.equal(profileAfterLogoutError.error, "NOT_AUTHENTICATED");
  });

  // Verifies the API returns its documented validation and duplicate-email error codes.
  it("rejects invalid registration data and duplicate emails with documented codes", async (t) => {
    const email = createTestEmail();
    await trackTestEmail(t, email);

    const invalidRegistrationResponse = await sendRequest("/register", { method: "POST", body: { ...validRegistration(email), email: "not-an-email" } });
    const invalidRegistrationError = await invalidRegistrationResponse.json();

    assert.equal(invalidRegistrationResponse.status, 400);
    assert.equal(invalidRegistrationError.error, "INVALID_INPUT");

    const registrationResponse = await sendRequest("/register", { method: "POST", body: validRegistration(email) });
    assert.equal(registrationResponse.status, 201);

    const duplicateResponse = await sendRequest("/register", { method: "POST", body: { ...validRegistration(email), email: ` ${email.toUpperCase()} ` } });
    const duplicateError = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 409);
    assert.equal(duplicateError.error, "EMAIL_ALREADY_USED");
  });

  // Verifies invalid credentials and unauthenticated protected-route access return the documented errors.
  it("rejects invalid login credentials and unauthenticated requests", async () => {
    const invalidCredentialsResponse = await sendRequest("/login", { method: "POST", body: { email: "unknown@example.com", password: "incorrect-password" } });
    const invalidCredentialsError = await invalidCredentialsResponse.json();

    assert.equal(invalidCredentialsResponse.status, 401);
    assert.equal(invalidCredentialsError.error, "INVALID_CREDENTIALS");

    const missingCredentialsResponse = await sendRequest("/login", { method: "POST", body: { email: "unknown@example.com" } });
    const missingCredentialsError = await missingCredentialsResponse.json();

    assert.equal(missingCredentialsResponse.status, 400);
    assert.equal(missingCredentialsError.error, "INVALID_INPUT");

    const unauthenticatedProfileResponse = await sendRequest("/me");
    const unauthenticatedProfileError = await unauthenticatedProfileResponse.json();

    assert.equal(unauthenticatedProfileResponse.status, 401);
    assert.equal(unauthenticatedProfileError.error, "NOT_AUTHENTICATED");

    const unauthenticatedLogoutResponse = await sendRequest("/logout", { method: "POST" });
    const unauthenticatedLogoutError = await unauthenticatedLogoutResponse.json();

    assert.equal(unauthenticatedLogoutResponse.status, 401);
    assert.equal(unauthenticatedLogoutError.error, "NOT_AUTHENTICATED");
  });
});