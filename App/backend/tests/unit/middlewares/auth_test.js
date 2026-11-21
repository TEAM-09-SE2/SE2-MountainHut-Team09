import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import authRepository from "../../../src/database/auth.repository.js";
import { requireAuth, requireAuthAllowTemporaryPassword } from "../../../src/middlewares/auth.js";

const originalSecret = process.env.JWT_SECRET;
afterEach(() => {
  mock.reset();
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

function authenticatedRequest() {
  process.env.JWT_SECRET = "auth-middleware-test-secret";
  return { cookies: { token: jwt.sign({ id: 7, role: "warden" }, process.env.JWT_SECRET) } };
}

describe("authentication state checks", () => {
  it("passes database failures to the error handler unchanged", async () => {
    const failure = new Error("database unavailable");
    const req = authenticatedRequest();
    mock.method(authRepository, "findUserById", async () => { throw failure; });
    const next = mock.fn();
    await requireAuth(req, {}, next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0].arguments[0], failure);
  });

  it("reports a missing JWT secret as a configuration error without querying the database", async () => {
    const req = authenticatedRequest();
    delete process.env.JWT_SECRET;
    const lookup = mock.method(authRepository, "findUserById");
    const next = mock.fn();
    await requireAuth(req, {}, next);
    assert.equal(next.mock.callCount(), 1);
    assert.match(next.mock.calls[0].arguments[0].message, /JWT_SECRET/);
    assert.equal(lookup.mock.callCount(), 0);
  });

  it("allows authentication with a temporary password only through the explicit exception middleware", async () => {
    const req = authenticatedRequest();
    mock.method(authRepository, "findUserById", async () => ({ id: 7, role: "employee", mustChangePassword: true }));
    const blocked = mock.fn();
    await requireAuth(req, {}, blocked);
    assert.equal(blocked.mock.calls[0].arguments[0].code, "PASSWORD_CHANGE_REQUIRED");
    const allowed = mock.fn();
    await requireAuthAllowTemporaryPassword(req, {}, allowed);
    assert.equal(allowed.mock.callCount(), 1);
    assert.deepEqual(allowed.mock.calls[0].arguments, []);
    assert.deepEqual(req.user, { id: 7, role: "employee" });
  });
});
