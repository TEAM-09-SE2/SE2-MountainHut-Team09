import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import authController from "../../../src/controllers/auth.controller.js";
import { BadRequestError, UnauthorizedError } from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";

afterEach(() => {
  mock.reset();
});

function createResponse() {
  return {
    status: mock.fn(function (statusCode) { this.statusCode = statusCode; return this; }),
    json: mock.fn(function (body) { this.body = body; return this; }),
    end: mock.fn(),
  };
}

const validBody = () => ({ currentPassword: "Temporary123", newPassword: "Permanent456" });

describe("authController.changePassword", () => {
  // Verifies a successful change answers 204 with no body, using the logged-in user's id.
  it("returns 204 with an empty body when the password is changed", async () => {
    const body = validBody();
    const changePasswordMock = mock.method(authService, "changePassword", async () => undefined);
    const res = createResponse();

    await authController.changePassword({ user: { id: 7, role: "employee" }, body }, res);

    assert.equal(changePasswordMock.mock.callCount(), 1);
    assert.equal(changePasswordMock.mock.calls[0].arguments[0], 7);
    assert.equal(changePasswordMock.mock.calls[0].arguments[1], body);
    assert.equal(res.statusCode, 204);
    assert.equal(res.end.mock.callCount(), 1);
    assert.equal(res.json.mock.callCount(), 0);
  });

  // Verifies an id in the body cannot select another account: only req.user.id is used.
  it("ignores an id sent in the body", async () => {
    const changePasswordMock = mock.method(authService, "changePassword", async () => undefined);

    await authController.changePassword({ user: { id: 7, role: "hiker" }, body: { ...validBody(), id: 99 } }, createResponse());

    assert.equal(changePasswordMock.mock.calls[0].arguments[0], 7);
  });

  // Verifies missing, empty and non-object bodies are rejected without calling the service.
  it("rejects missing, empty and invalid request bodies", async () => {
    const changePasswordMock = mock.method(authService, "changePassword");

    for (const body of [undefined, null, {}, [], [validBody()], "invalid"]) {
      const res = createResponse();

      await assert.rejects(authController.changePassword({ user: { id: 7, role: "employee" }, body }, res), (error) => {
        assert.ok(error instanceof BadRequestError);
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, "INVALID_INPUT");
        return true;
      });
      assert.equal(res.status.mock.callCount(), 0);
    }

    assert.equal(changePasswordMock.mock.callCount(), 0);
  });

  // Verifies service errors reach the error handler and no response is sent.
  it("propagates service errors without sending a response", async () => {
    const invalidCredentials = new UnauthorizedError("Invalid current password.", "INVALID_CREDENTIALS");
    mock.method(authService, "changePassword", async () => { throw invalidCredentials; });
    const res = createResponse();

    await assert.rejects(authController.changePassword({ user: { id: 7, role: "employee" }, body: validBody() }, res), (error) => error === invalidCredentials);

    assert.equal(res.status.mock.callCount(), 0);
    assert.equal(res.end.mock.callCount(), 0);
  });
});

describe("authController.login (temporary password)", () => {
  // Verifies the login response carries mustChangePassword while the token keeps only id and role.
  it("returns mustChangePassword in the body and keeps the flag out of the token", async () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "password-controller-unit-secret";
    const user = { id: 7, email: "employee@example.com", firstName: "Ada", lastName: "Lovelace", role: "employee", mustChangePassword: true };
    mock.method(authService, "loginUser", async () => user);
    const res = { ...createResponse(), cookie: mock.fn() };

    try {
      await authController.login({ body: { email: user.email, password: "Temporary123" } }, res);
      const [name, token] = res.cookie.mock.calls[0].arguments;
      const { iat, exp, ...claims } = jwt.verify(token, process.env.JWT_SECRET);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, user);
      assert.equal(name, "token");
      assert.deepEqual(claims, { id: 7, role: "employee" });
    } finally {
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
    }
  });
});

describe("authController.me (temporary password)", () => {
  // Verifies the profile of the logged-in user includes mustChangePassword.
  it("returns 200 with the profile and the temporary password flag", async () => {
    const profile = { id: 7, email: "employee@example.com", firstName: "Ada", lastName: "Lovelace", phone: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, role: "employee", mustChangePassword: true };
    const getCurrentUserMock = mock.method(authService, "getCurrentUser", async () => profile);
    const res = createResponse();

    await authController.me({ user: { id: 7, role: "employee" } }, res);

    assert.equal(getCurrentUserMock.mock.calls[0].arguments[0], 7);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, profile);
  });
});

describe("authController.logout (temporary password)", () => {
  // Verifies logout clears the token cookie and answers 204.
  it("clears the token cookie and returns 204", () => {
    const res = { ...createResponse(), clearCookie: mock.fn() };

    authController.logout({ user: { id: 7, role: "employee" } }, res);

    assert.equal(res.clearCookie.mock.calls[0].arguments[0], "token");
    assert.equal(res.statusCode, 204);
    assert.equal(res.end.mock.callCount(), 1);
  });
});
