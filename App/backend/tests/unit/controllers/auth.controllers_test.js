import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import authController from "../../../src/controllers/auth.controller.js";
import authService from "../../../src/services/auth.service.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../../src/errors/ErrorClass.js";

let originalJwtSecret;
let originalNodeEnv;

beforeEach(() => {
    originalJwtSecret = process.env.JWT_SECRET;
    originalNodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
    mock.reset();

    if (originalJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
    }
    else {
        process.env.JWT_SECRET = originalJwtSecret;
    }

    if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
    }
    else {
        process.env.NODE_ENV = originalNodeEnv;
    }
});

const validUser = () => ({ id: 7, email: "hiker@example.com", firstName: "Ada", lastName: "Lovelace", role: "hiker" });

function createResponse() {
    return {
        status: mock.fn(function (statusCode) { this.statusCode = statusCode; return this; }),
        json: mock.fn(function (body) { this.body = body; return this; }),
        cookie: mock.fn(),
        clearCookie: mock.fn(),
        end: mock.fn(),
    };
}

describe("authController.register", () => {
    // Verifies successful registration returns the created user with HTTP 201.
    it("returns 201 with the user when registration succeeds", async () => {
        const requestBody = { email: "hiker@example.com", password: "password123", firstName: "Ada", lastName: "Lovelace" };
        const user = validUser();
        const registerUserMock = mock.method(authService, "registerUser", async () => user);
        const res = createResponse();
        const next = mock.fn();

        await authController.register({ body: requestBody }, res, next);

        assert.deepEqual(registerUserMock.mock.calls[0].arguments[0], requestBody);
        assert.equal(registerUserMock.mock.callCount(), 1);
        assert.equal(res.statusCode, 201);
        assert.deepEqual(res.body, user);
        assert.equal(next.mock.callCount(), 0);
    });

    // Verifies missing or invalid bodies are passed to the error middleware without calling the service.
    it("forwards missing, empty, and invalid request bodies to next", async () => {
        const registerUserMock = mock.method(authService, "registerUser");

        for (const body of [undefined, null, {}, [], "invalid"]) {
            const res = createResponse();
            const next = mock.fn();

            await authController.register({ body }, res, next);

            assert.equal(next.mock.callCount(), 1);
            assert.ok(next.mock.calls[0].arguments[0] instanceof BadRequestError);
            assert.equal(next.mock.calls[0].arguments[0].code, "INVALID_INPUT");
        }

        assert.equal(registerUserMock.mock.callCount(), 0);
    });

    // Verifies documented and unexpected registration errors are passed to the error middleware unchanged.
    it("forwards documented and unexpected service errors to next unchanged", async () => {
        const errors = [
            new BadRequestError("Invalid input.", "INVALID_INPUT"),
            new ConflictError("Email already used.", "EMAIL_ALREADY_USED"),
            new Error("Database unavailable."),
        ];
        let serviceError;
        mock.method(authService, "registerUser", async () => { throw serviceError; });

        for (const error of errors) {
            serviceError = error;
            const next = mock.fn();

            await authController.register({ body: { email: "hiker@example.com" } }, createResponse(), next);

            assert.equal(next.mock.callCount(), 1);
            assert.equal(next.mock.calls[0].arguments[0], error);
        }
    });
});

describe("authController.login", () => {
    // Verifies successful login returns the user and sets a valid authentication cookie.
    it("returns 200, the user, and a valid authentication cookie on success", async () => {
        process.env.JWT_SECRET = "auth-controller-test-secret";
        process.env.NODE_ENV = "test";
        const requestBody = { email: "hiker@example.com", password: "password123" };
        const user = validUser();
        const loginUserMock = mock.method(authService, "loginUser", async () => user);
        const res = createResponse();
        const next = mock.fn();

        await authController.login({ body: requestBody }, res, next);

        assert.deepEqual(loginUserMock.mock.calls[0].arguments[0], requestBody);
        assert.equal(loginUserMock.mock.callCount(), 1);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, user);
        assert.equal(res.cookie.mock.callCount(), 1);
        assert.equal(res.cookie.mock.calls[0].arguments[0], "token");
        const tokenPayload = jwt.verify(res.cookie.mock.calls[0].arguments[1], process.env.JWT_SECRET);
        assert.deepEqual({ id: tokenPayload.id, email: tokenPayload.email, firstName: tokenPayload.firstName, lastName: tokenPayload.lastName, role: tokenPayload.role }, user);
        assert.ok(tokenPayload.exp > tokenPayload.iat);
        assert.deepEqual(res.cookie.mock.calls[0].arguments[2], { httpOnly: true, secure: false, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
        assert.equal(next.mock.callCount(), 0);
    });

    // Verifies missing or invalid bodies are passed to the error middleware without calling the service.
    it("forwards missing, empty, and invalid request bodies to next", async () => {
        const loginUserMock = mock.method(authService, "loginUser");

        for (const body of [undefined, null, {}, [], "invalid"]) {
            const res = createResponse();
            const next = mock.fn();

            await authController.login({ body }, res, next);

            assert.equal(next.mock.callCount(), 1);
            assert.ok(next.mock.calls[0].arguments[0] instanceof BadRequestError);
            assert.equal(next.mock.calls[0].arguments[0].code, "INVALID_INPUT");
        }

        assert.equal(loginUserMock.mock.callCount(), 0);
    });

    // Verifies documented and unexpected login errors are passed to the error middleware unchanged.
    it("forwards documented and unexpected service errors to next unchanged", async () => {
        const errors = [
            new BadRequestError("Invalid input.", "INVALID_INPUT"),
            new UnauthorizedError("Invalid email or password.", "INVALID_CREDENTIALS"),
            new Error("Database unavailable."),
        ];
        let serviceError;
        mock.method(authService, "loginUser", async () => { throw serviceError; });

        for (const error of errors) {
            serviceError = error;
            const res = createResponse();
            const next = mock.fn();

            await authController.login({ body: { email: "hiker@example.com", password: "password123" } }, res, next);

            assert.equal(next.mock.callCount(), 1);
            assert.equal(next.mock.calls[0].arguments[0], error);
            assert.equal(res.cookie.mock.callCount(), 0);
        }
    });
});

describe("authController.me", () => {
    // Verifies the response contains only public fields from the authenticated user.
    it("returns the authenticated user's public fields", () => {
        const res = createResponse();

        authController.me({ user: { ...validUser(), salt: "private-salt", password_hash: "private-hash" } }, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, validUser());
        assert.equal(Object.hasOwn(res.body, "salt"), false);
        assert.equal(Object.hasOwn(res.body, "password_hash"), false);
    });
});

describe("authController.logout", () => {
    // Verifies logout clears the authentication cookie and ends the response with HTTP 204.
    it("clears the authentication cookie and returns 204", () => {
        process.env.NODE_ENV = "production";
        const res = createResponse();

        authController.logout({}, res);

        assert.equal(res.clearCookie.mock.callCount(), 1);
        assert.equal(res.clearCookie.mock.calls[0].arguments[0], "token");
        assert.deepEqual(res.clearCookie.mock.calls[0].arguments[1], { httpOnly: true, secure: true, sameSite: "lax" });
        assert.equal(res.statusCode, 204);
        assert.equal(res.end.mock.callCount(), 1);
    });
});