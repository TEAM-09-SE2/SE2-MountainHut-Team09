import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import authRepository from "../../../src/database/auth.repository.js";
import { ErrorClass, ForbiddenError, UnauthorizedError } from "../../../src/errors/ErrorClass.js";
import { requireAuth, requireAuthAllowTemporaryPassword } from "../../../src/middlewares/auth.js";

const testJwtSecret = "auth-middleware-unit-secret";
let originalJwtSecret;

beforeEach(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = testJwtSecret;
});

afterEach(() => {
  mock.reset();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

const storedUser = (fields = {}) => ({
  id: 7,
  email: "employee@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  notes: null,
  role: "employee",
  mustChangePassword: false,
  ...fields,
});

const DEFAULT_TOKEN_PAYLOAD = Object.freeze({ id: 7, role: "employee" });

const requestWithToken = (payload = DEFAULT_TOKEN_PAYLOAD, secret = testJwtSecret, options = {}) => ({
  cookies: { token: jwt.sign(payload, secret, options) },
});

async function runMiddleware(middleware, req) {
  const next = mock.fn();
  await middleware(req, {}, next);
  assert.equal(next.mock.callCount(), 1);
  return next.mock.calls[0].arguments;
}

function assertAppError(error, ErrorType, statusCode, code) {
  assert.ok(error instanceof ErrorType);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

const middlewares = [
  ["requireAuth", requireAuth],
  ["requireAuthAllowTemporaryPassword", requireAuthAllowTemporaryPassword],
];

describe("requireAuth_unit", () => {
  // Verifies a valid session takes the role from the database, not from the token, and keeps only id and role.
  it("sets req.user from the current database row and calls next without an error", async () => {
    const findUserByIdMock = mock.method(authRepository, "findUserById", async () => storedUser({ role: "warden" }));
    const req = requestWithToken({ id: 7, role: "hiker" });

    const args = await runMiddleware(requireAuth, req);

    assert.deepEqual(args, []);
    assert.deepEqual(req.user, { id: 7, role: "warden" });
    assert.equal(findUserByIdMock.mock.callCount(), 1);
    assert.equal(findUserByIdMock.mock.calls[0].arguments[0], 7);
  });

  // Verifies a user who still has a temporary password is blocked with 403 PASSWORD_CHANGE_REQUIRED.
  it("rejects a user who must still change the temporary password", async () => {
    mock.method(authRepository, "findUserById", async () => storedUser({ mustChangePassword: true }));

    const [error] = await runMiddleware(requireAuth, requestWithToken());

    assertAppError(error, ForbiddenError, 403, "PASSWORD_CHANGE_REQUIRED");
  });

  // Verifies the largest PostgreSQL integer id is still accepted.
  it("accepts the largest valid user id", async () => {
    mock.method(authRepository, "findUserById", async () => storedUser({ id: 2147483647 }));
    const req = requestWithToken({ id: 2147483647 });

    const args = await runMiddleware(requireAuth, req);

    assert.deepEqual(args, []);
    assert.equal(req.user.id, 2147483647);
  });

  for (const [name, middleware] of middlewares) {
    // Verifies a request without a token cookie is rejected before the database is queried.
    it(`${name}: rejects requests without a token cookie`, async () => {
      const findUserByIdMock = mock.method(authRepository, "findUserById");

      for (const req of [{}, { cookies: {} }, { cookies: { token: "" } }]) {
        const [error] = await runMiddleware(middleware, req);
        assertAppError(error, UnauthorizedError, 401, "NOT_AUTHENTICATED");
      }

      assert.equal(findUserByIdMock.mock.callCount(), 0);
    });

    // Verifies malformed, wrongly signed and expired tokens are rejected before the database is queried.
    it(`${name}: rejects malformed, wrongly signed and expired tokens`, async () => {
      const findUserByIdMock = mock.method(authRepository, "findUserById");
      const requests = [
        { cookies: { token: "not-a-jwt" } },
        requestWithToken({ id: 7 }, "another-secret"),
        requestWithToken({ id: 7 }, testJwtSecret, { expiresIn: -1 }),
      ];

      for (const req of requests) {
        const [error] = await runMiddleware(middleware, req);
        assertAppError(error, UnauthorizedError, 401, "NOT_AUTHENTICATED");
        assert.equal(req.user, undefined);
      }

      assert.equal(findUserByIdMock.mock.callCount(), 0);
    });

    // Verifies tokens whose id is not a positive PostgreSQL integer are rejected before the database is queried.
    it(`${name}: rejects tokens whose id is not a positive 32-bit integer`, async () => {
      const findUserByIdMock = mock.method(authRepository, "findUserById");

      for (const id of [undefined, null, "7", 0, -1, 1.5, 2147483648]) {
        const [error] = await runMiddleware(middleware, requestWithToken({ id, role: "warden" }));
        assertAppError(error, UnauthorizedError, 401, "NOT_AUTHENTICATED");
      }

      assert.equal(findUserByIdMock.mock.callCount(), 0);
    });

    // Verifies a missing JWT_SECRET is reported as a server error, not as a login problem.
    it(`${name}: reports a missing JWT_SECRET as a configuration error`, async () => {
      const findUserByIdMock = mock.method(authRepository, "findUserById");
      const req = requestWithToken();
      delete process.env.JWT_SECRET;

      const [error] = await runMiddleware(middleware, req);

      assert.ok(error instanceof Error);
      assert.equal(error instanceof ErrorClass, false);
      assert.match(error.message, /JWT_SECRET/);
      assert.equal(findUserByIdMock.mock.callCount(), 0);
    });

    // Verifies a valid token for an account that no longer exists is rejected with 401.
    it(`${name}: rejects a valid token for a deleted account`, async () => {
      mock.method(authRepository, "findUserById", async () => null);
      const req = requestWithToken();

      const [error] = await runMiddleware(middleware, req);

      assertAppError(error, UnauthorizedError, 401, "NOT_AUTHENTICATED");
      assert.equal(req.user, undefined);
    });

    // Verifies database failures reach the error handler unchanged.
    it(`${name}: passes database errors to next unchanged`, async () => {
      const failure = new Error("database unavailable");
      mock.method(authRepository, "findUserById", async () => { throw failure; });

      const [error] = await runMiddleware(middleware, requestWithToken());

      assert.equal(error, failure);
    });
  }
});

describe("requireAuthAllowTemporaryPassword_unit", () => {
  // Verifies a user with a temporary password can still reach the routes that allow it.
  it("lets a user with a temporary password through", async () => {
    mock.method(authRepository, "findUserById", async () => storedUser({ mustChangePassword: true }));
    const req = requestWithToken();

    const args = await runMiddleware(requireAuthAllowTemporaryPassword, req);

    assert.deepEqual(args, []);
    assert.deepEqual(req.user, { id: 7, role: "employee" });
  });

  // Verifies a user with a permanent password also passes, with the role read from the database.
  it("lets a user with a permanent password through", async () => {
    mock.method(authRepository, "findUserById", async () => storedUser({ role: "hiker" }));
    const req = requestWithToken({ id: 7, role: "warden" });

    const args = await runMiddleware(requireAuthAllowTemporaryPassword, req);

    assert.deepEqual(args, []);
    assert.deepEqual(req.user, { id: 7, role: "hiker" });
  });
});
