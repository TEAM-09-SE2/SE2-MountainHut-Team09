import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import app from "../../../src/app.js";
import authRepository from "../../../src/database/auth.repository.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testJwtSecret = "auth-integration-test-secret";
const server = app.listen(0, "127.0.0.1");
let baseUrl;
let storedUsers;
let nextUserId;

function mockAuthRepository() {
  storedUsers = new Map();
  nextUserId = 1;

  mock.method(authRepository, "findUserByEmail", async (email) => [...storedUsers.values()].find((user) => user.email === email) ?? null);
  mock.method(authRepository, "findUserById", async (id) => storedUsers.get(id) ?? null);
  mock.method(authRepository, "createUser", async ({ email, hash, salt, firstName, lastName, phone, role }) => {
    const user = { id: nextUserId++, email, firstName, lastName, phone: phone || null, role };
    storedUsers.set(user.id, { ...user, password_hash: hash, salt });
    return user;
  });
}

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  process.env.NODE_ENV = "test";
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});

afterEach(() => {
  mock.reset();
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });

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

const createTestEmail = () => `auth-controller-integration-${randomUUID()}@example.com`;

const validRegistration = (email) => ({ email, password: "password123", firstName: "Ada", lastName: "Lovelace" });

async function sendRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function registerTestUser(email) {
  return sendRequest("/register", { method: "POST", body: validRegistration(email) });
}

async function loginTestUser(email) {
  return sendRequest("/login", { method: "POST", body: { email, password: "password123" } });
}

function getTokenCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const token = setCookie.match(/(?:^|,\s*)token=([^;]+)/)?.[1];
  assert.ok(token);
  return { setCookie, token, cookie: `token=${token}` };
}

describe("auth controller and service integration", () => {
  describe("register", () => {
    // Verifies successful registration returns HTTP 201 and passes a verifiable password hash to the mocked repository.
    it("returns 201 with the user when registration succeeds", async () => {
      mockAuthRepository();
      const email = createTestEmail();
      const response = await registerTestUser(email);
      const user = await response.json();
      const storedUser = [...storedUsers.values()].find((user) => user.email === email);

      assert.equal(response.status, 201);
      assert.deepEqual(user, { id: storedUser.id, email, firstName: "Ada", lastName: "Lovelace", phone: null, role: "hiker" });
      assert.equal(verifyPassword("password123", storedUser.salt, storedUser.password_hash), true);
      assert.equal(authRepository.findUserByEmail.mock.callCount(), 1);
      assert.equal(authRepository.createUser.mock.callCount(), 1);
      assert.equal(Object.hasOwn(user, "password_hash"), false);
      assert.equal(Object.hasOwn(user, "salt"), false);
    });

    // Verifies missing and empty request bodies return a client error without calling the service or repository.
    it("rejects missing and empty request bodies", async () => {
      mockAuthRepository();

      for (const body of [undefined, {}, []]) {
        const response = await sendRequest("/register", { method: "POST", body });
        const error = await response.json();

        assert.equal(response.status, 400);
        assert.equal(error.error, "INVALID_INPUT");
        assert.equal(error.message, "Request body is missing or empty.");
      }

      assert.equal(authRepository.findUserByEmail.mock.callCount(), 0);
      assert.equal(authRepository.createUser.mock.callCount(), 0);
    });

    // Verifies registration validation errors from the service reach the HTTP response without repository calls.
    it("returns client errors for invalid registration fields", async () => {
      mockAuthRepository();
      const email = createTestEmail();
      const invalidCases = [
        { input: { email: "not-an-email" }, code: "INVALID_INPUT", message: "Invalid email format." },
        { input: { password: "short7" }, code: "INVALID_INPUT", message: "Password must be at least 8 characters long." },
        { input: { firstName: "   " }, code: "INVALID_INPUT", message: "First name is required." },
        { input: { lastName: "   " }, code: "INVALID_INPUT", message: "Last name is required." },
        { input: { phone: "123-456" }, code: "INVALID_INPUT", message: "Phone number must contain only digits and be at most 10 characters long." },
      ];

      for (const { input, code, message } of invalidCases) {
        const response = await sendRequest("/register", { method: "POST", body: { ...validRegistration(email), ...input } });
        const error = await response.json();

        assert.equal(response.status, 400);
        assert.equal(error.error, code);
        assert.equal(error.message, message);
      }

      assert.equal(authRepository.findUserByEmail.mock.callCount(), 0);
      assert.equal(authRepository.createUser.mock.callCount(), 0);
    });

    // Verifies the service rejects an email already returned by the mocked repository with HTTP 409.
    it("rejects registration when the normalized email already exists", async () => {
      mockAuthRepository();
      const email = createTestEmail();
      const firstResponse = await registerTestUser(email);
      assert.equal(firstResponse.status, 201);

      const response = await sendRequest("/register", { method: "POST", body: { ...validRegistration(email), email: ` ${email.toUpperCase()} ` } });
      const error = await response.json();

      assert.equal(response.status, 409);
      assert.equal(error.error, "EMAIL_ALREADY_USED");
      assert.equal(error.message, "An account with this email already exists.");
      assert.equal(authRepository.createUser.mock.callCount(), 1);
    });
  });

  describe("login", () => {
    // Verifies successful login returns HTTP 200 and sets a valid authentication cookie.
    it("returns the user and a valid authentication cookie on success", async () => {
      mockAuthRepository();
      const email = createTestEmail();
      const registrationResponse = await registerTestUser(email);
      assert.equal(registrationResponse.status, 201);

      const response = await loginTestUser(` ${email.toUpperCase()} `);
      const user = await response.json();
      const { setCookie, token } = getTokenCookie(response);
      const tokenPayload = jwt.verify(token, testJwtSecret);

      assert.equal(response.status, 200);
      assert.deepEqual(user, { id: tokenPayload.id, email, firstName: "Ada", lastName: "Lovelace", role: "hiker" });
      assert.deepEqual({ id: tokenPayload.id, email: tokenPayload.email, firstName: tokenPayload.firstName, lastName: tokenPayload.lastName, role: tokenPayload.role }, user);
      assert.equal(Object.hasOwn(user, "salt"), false);
      assert.equal(Object.hasOwn(user, "password_hash"), false);
      assert.equal(authRepository.findUserByEmail.mock.callCount(), 2);
    });

    // Verifies missing or empty request bodies return a client error without calling the service or repository.
    it("rejects missing and empty request bodies", async () => {
      mockAuthRepository();

      for (const body of [undefined, {}, []]) {
        const response = await sendRequest("/login", { method: "POST", body });
        const error = await response.json();

        assert.equal(response.status, 400);
        assert.equal(error.error, "INVALID_INPUT");
        assert.equal(error.message, "Request body is missing or empty.");
      }

      assert.equal(authRepository.findUserByEmail.mock.callCount(), 0);
    });

    // Verifies invalid credentials are returned as client errors by the service and error handler.
    it("rejects missing credentials with a client error", async () => {
      mockAuthRepository();
      const response = await sendRequest("/login", { method: "POST", body: { email: "hiker@example.com" } });
      const error = await response.json();

      assert.equal(response.status, 400);
      assert.equal(error.error, "INVALID_INPUT");
      assert.equal(error.message, "Email and password are required.");
      assert.equal(authRepository.findUserByEmail.mock.callCount(), 0);
    });

    // Verifies nonexistent users and incorrect passwords produce the same unauthorized response.
    it("rejects nonexistent users and incorrect passwords", async () => {
      mockAuthRepository();
      const email = createTestEmail();

      const nonexistentResponse = await loginTestUser(email);
      const nonexistentError = await nonexistentResponse.json();
      assert.equal(nonexistentResponse.status, 401);
      assert.equal(nonexistentError.error, "INVALID_CREDENTIALS");
      assert.equal(nonexistentError.message, "Invalid email or password.");

      const { hash, salt } = hashPassword("password123");
      storedUsers.set(1, { id: 1, email, firstName: "Ada", lastName: "Lovelace", phone: null, role: "hiker", password_hash: hash, salt });
      const incorrectPasswordResponse = await sendRequest("/login", { method: "POST", body: { email, password: "incorrect-password" } });
      const incorrectPasswordError = await incorrectPasswordResponse.json();
      assert.equal(incorrectPasswordResponse.status, 401);
      assert.equal(incorrectPasswordError.error, "INVALID_CREDENTIALS");
      assert.equal(incorrectPasswordError.message, "Invalid email or password.");
      assert.equal(authRepository.findUserByEmail.mock.callCount(), 2);
    });
  });

  describe("me", () => {
    // Verifies an authenticated user receives only public fields from the authenticated token.
    it("returns the authenticated user's public fields", async () => {
      mockAuthRepository();
      const email = createTestEmail();
      const registrationResponse = await registerTestUser(email);
      assert.equal(registrationResponse.status, 201);
      const loginResponse = await loginTestUser(email);
      assert.equal(loginResponse.status, 200);
      const { cookie } = getTokenCookie(loginResponse);

      const response = await sendRequest("/me", { cookie });
      const user = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(user, { id: [...storedUsers.values()].find((storedUser) => storedUser.email === email).id, email, firstName: "Ada", lastName: "Lovelace", role: "hiker" });
      assert.equal(Object.hasOwn(user, "salt"), false);
      assert.equal(Object.hasOwn(user, "password_hash"), false);
    });

    // Verifies unauthenticated requests are rejected by the authentication middleware.
    it("rejects requests without an authentication cookie", async () => {
      mockAuthRepository();
      const response = await sendRequest("/me");
      const error = await response.json();

      assert.equal(response.status, 401);
      assert.equal(error.error, "NOT_AUTHENTICATED");
      assert.equal(authRepository.findUserByEmail.mock.callCount(), 0);
    });
  });

  describe("logout", () => {
    // Verifies logout clears the authentication cookie and returns HTTP 204.
    it("clears the authentication cookie on success", async () => {
      mockAuthRepository();
      const email = createTestEmail();
      const registrationResponse = await registerTestUser(email);
      assert.equal(registrationResponse.status, 201);
      const loginResponse = await loginTestUser(email);
      assert.equal(loginResponse.status, 200);
      const { cookie } = getTokenCookie(loginResponse);

      const response = await sendRequest("/logout", { method: "POST", cookie });
      const setCookie = response.headers.get("set-cookie");

      assert.equal(response.status, 204);
      assert.match(setCookie, /token=;/);
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
    });

    // Verifies unauthenticated logout requests are rejected by the authentication middleware.
    it("rejects requests without an authentication cookie", async () => {
      mockAuthRepository();
      const response = await sendRequest("/logout", { method: "POST" });
      const error = await response.json();

      assert.equal(response.status, 401);
      assert.equal(error.error, "NOT_AUTHENTICATED");
      assert.equal(authRepository.findUserByEmail.mock.callCount(), 0);
    });
  });
});