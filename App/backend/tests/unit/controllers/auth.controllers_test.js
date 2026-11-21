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

const validProfile = () => ({
    ...validUser(),
    phone: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    mustChangePassword: false,
});

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

        await authController.register({ body: requestBody }, res);

        assert.deepEqual(registerUserMock.mock.calls[0].arguments[0], requestBody);
        assert.equal(registerUserMock.mock.callCount(), 1);
        assert.equal(res.statusCode, 201);
        assert.deepEqual(res.body, user);
    });

    // Verifies missing or invalid bodies are rejected without calling the service.
    // Express 5 forwards the rejected promise to the error middleware.
    it("rejects missing, empty, and invalid request bodies", async () => {
        const registerUserMock = mock.method(authService, "registerUser");

        for (const body of [undefined, null, {}, [], "invalid"]) {
            const res = createResponse();

            await assert.rejects(authController.register({ body }, res), (error) => {
                assert.ok(error instanceof BadRequestError);
                assert.equal(error.code, "INVALID_INPUT");
                return true;
            });
            assert.equal(res.status.mock.callCount(), 0);
        }

        assert.equal(registerUserMock.mock.callCount(), 0);
    });

    // Verifies documented and unexpected registration errors are rethrown unchanged for the error middleware.
    it("rethrows documented and unexpected service errors unchanged", async () => {
        const errors = [
            new BadRequestError("Invalid input.", "INVALID_INPUT"),
            new ConflictError("Email already used.", "EMAIL_ALREADY_USED"),
            new Error("Database unavailable."),
        ];
        let serviceError;
        mock.method(authService, "registerUser", async () => { throw serviceError; });

        for (const error of errors) {
            serviceError = error;
            const res = createResponse();

            await assert.rejects(authController.register({ body: { email: "hiker@example.com" } }, res), (thrown) => thrown === error);
            assert.equal(res.status.mock.callCount(), 0);
        }
    });
});

describe("authController.login", () => {
    // Verifies successful login returns the user and sets a cookie whose token holds only id and role.
    it("returns 200, the user, and a valid authentication cookie on success", async () => {
        process.env.JWT_SECRET = "auth-controller-test-secret";
        process.env.NODE_ENV = "test";
        const requestBody = { email: "hiker@example.com", password: "password123" };
        const user = validUser();
        const loginUserMock = mock.method(authService, "loginUser", async () => user);
        const res = createResponse();

        await authController.login({ body: requestBody }, res);

        assert.deepEqual(loginUserMock.mock.calls[0].arguments[0], requestBody);
        assert.equal(loginUserMock.mock.callCount(), 1);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, user);
        assert.equal(res.cookie.mock.callCount(), 1);
        assert.equal(res.cookie.mock.calls[0].arguments[0], "token");
        const tokenPayload = jwt.verify(res.cookie.mock.calls[0].arguments[1], process.env.JWT_SECRET);
        const { iat, exp, ...claims } = tokenPayload;
        assert.deepEqual(claims, { id: user.id, role: user.role });
        assert.ok(exp > iat);
        assert.deepEqual(res.cookie.mock.calls[0].arguments[2], { httpOnly: true, secure: false, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
    });

    // Verifies missing or invalid bodies are rejected without calling the service or setting a cookie.
    it("rejects missing, empty, and invalid request bodies", async () => {
        const loginUserMock = mock.method(authService, "loginUser");

        for (const body of [undefined, null, {}, [], "invalid"]) {
            const res = createResponse();

            await assert.rejects(authController.login({ body }, res), (error) => {
                assert.ok(error instanceof BadRequestError);
                assert.equal(error.code, "INVALID_INPUT");
                return true;
            });
            assert.equal(res.cookie.mock.callCount(), 0);
        }

        assert.equal(loginUserMock.mock.callCount(), 0);
    });

    // Verifies documented and unexpected login errors are rethrown unchanged and no cookie is set.
    it("rethrows documented and unexpected service errors unchanged", async () => {
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

            await assert.rejects(
                authController.login({ body: { email: "hiker@example.com", password: "password123" } }, res),
                (thrown) => thrown === error,
            );
            assert.equal(res.cookie.mock.callCount(), 0);
        }
    });
});

describe("authController.me", () => {
    // Verifies the profile is read through the service using only the id from the token.
    it("returns 200 with the profile of the authenticated user", async () => {
        const profile = validProfile();
        const getCurrentUserMock = mock.method(authService, "getCurrentUser", async () => profile);
        const res = createResponse();

        await authController.me({ user: { id: 7, role: "hiker" } }, res);

        assert.equal(getCurrentUserMock.mock.callCount(), 1);
        assert.deepEqual(getCurrentUserMock.mock.calls[0].arguments, [7]);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, profile);
    });

    // Verifies a token whose user no longer exists is rejected with the service error.
    it("rethrows the service error when the user no longer exists", async () => {
        const error = new UnauthorizedError("User is not authenticated.", "NOT_AUTHENTICATED");
        mock.method(authService, "getCurrentUser", async () => { throw error; });
        const res = createResponse();

        await assert.rejects(authController.me({ user: { id: 99, role: "hiker" } }, res), (thrown) => thrown === error);
        assert.equal(res.status.mock.callCount(), 0);
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