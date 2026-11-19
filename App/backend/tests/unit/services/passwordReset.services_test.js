import { createHash } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import authRepository from "../../../src/database/auth.repository.js";
import passwordResetEmailService from "../../../src/services/passwordResetEmail.service.js";
import authService from "../../../src/services/auth.service.js";

const buildValidNewSecret = () => ["Reset", "Secret", "2026!"].join("");

afterEach(() => {
  mock.reset();
});

describe("password reset service unit tests (MH-07)", () => {
  describe("requestPasswordReset", () => {
    it("rejects non-string, oversized, or malformed emails with 400 INVALID_INPUT", async () => {
      const lookupMock = mock.method(authRepository, "findPasswordResetUserByEmail", async () => null);

      for (const badEmail of [undefined, null, 123, "not-an-email", `${"a".repeat(250)}@b.com`]) {
        await assert.rejects(
          () => authService.requestPasswordReset(badEmail),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );
      }

      assert.equal(lookupMock.mock.callCount(), 0);
    });

    it("returns silently without creating a token or sending email when user does not exist", async () => {
      const lookupMock = mock.method(authRepository, "findPasswordResetUserByEmail", async () => null);
      const createTokenMock = mock.method(authRepository, "createPasswordResetToken", async () => {});
      const sendEmailMock = mock.method(passwordResetEmailService, "sendPasswordResetEmail", async () => true);

      await authService.requestPasswordReset("  Unknown@Example.com  ");

      assert.deepEqual(lookupMock.mock.calls[0].arguments, ["unknown@example.com"]);
      assert.equal(createTokenMock.mock.callCount(), 0);
      assert.equal(sendEmailMock.mock.callCount(), 0);
    });

    it("stores a SHA-256 token hash with 24h TTL and emails the raw token when user exists", async () => {
      const user = { id: 8, email: "anna@example.com", firstName: "Anna" };
      mock.method(authRepository, "findPasswordResetUserByEmail", async () => user);
      const createTokenMock = mock.method(authRepository, "createPasswordResetToken", async () => {});
      const sendEmailMock = mock.method(passwordResetEmailService, "sendPasswordResetEmail", async () => true);

      await authService.requestPasswordReset("  ANNA@Example.com ");

      assert.equal(createTokenMock.mock.callCount(), 1);
      assert.equal(sendEmailMock.mock.callCount(), 1);

      const [savedUserId, savedHash, ttlHours] = createTokenMock.mock.calls[0].arguments;
      const [emailedUser, rawToken] = sendEmailMock.mock.calls[0].arguments;

      assert.equal(savedUserId, 8);
      assert.equal(ttlHours, 24);
      assert.deepEqual(emailedUser, user);
      assert.equal(rawToken.length, 64);
      const expectedHash = createHash("sha256").update(rawToken).digest("hex");
      assert.equal(savedHash, expectedHash);
    });
  });

  describe("confirmPasswordReset", () => {
    it("rejects missing token or short newPassword with 400 INVALID_INPUT", async () => {
      const lookupMock = mock.method(authRepository, "findValidPasswordResetToken", async () => null);

      const invalidInputs = [
        { token: "", newPassword: buildValidNewSecret() },
        { token: null, newPassword: buildValidNewSecret() },
        { token: "valid-token", newPassword: "short" },
        { token: "valid-token", newPassword: 12345678 },
      ];

      for (const payload of invalidInputs) {
        await assert.rejects(
          () => authService.confirmPasswordReset(payload),
          (err) => err.statusCode === 400 && err.code === "INVALID_INPUT",
        );
      }

      assert.equal(lookupMock.mock.callCount(), 0);
    });

    it("rejects unknown or expired tokens with 400 INVALID_RESET_TOKEN", async () => {
      mock.method(authRepository, "findValidPasswordResetToken", async () => null);
      const confirmMock = mock.method(authRepository, "confirmPasswordReset", async () => true);

      await assert.rejects(
        () => authService.confirmPasswordReset({ token: "expired-tok", newPassword: buildValidNewSecret() }),
        (err) => err.statusCode === 400 && err.code === "INVALID_RESET_TOKEN",
      );

      assert.equal(confirmMock.mock.callCount(), 0);
    });

    it("rejects with 400 INVALID_RESET_TOKEN when atomic confirmation returns false", async () => {
      mock.method(authRepository, "findValidPasswordResetToken", async () => ({ userId: 8 }));
      mock.method(authRepository, "confirmPasswordReset", async () => false);

      await assert.rejects(
        () => authService.confirmPasswordReset({ token: "race-tok", newPassword: buildValidNewSecret() }),
        (err) => err.statusCode === 400 && err.code === "INVALID_RESET_TOKEN",
      );
    });

    it("hashes the new secret and updates the user password via authRepository", async () => {
      const rawToken = "valid-reset-token-123";
      const expectedHash = createHash("sha256").update(rawToken).digest("hex");

      const findMock = mock.method(authRepository, "findValidPasswordResetToken", async () => ({ userId: 8 }));
      const confirmMock = mock.method(authRepository, "confirmPasswordReset", async () => true);

      await authService.confirmPasswordReset({ token: rawToken, newPassword: buildValidNewSecret() });

      assert.deepEqual(findMock.mock.calls[0].arguments, [expectedHash]);
      assert.equal(confirmMock.mock.callCount(), 1);
      const [userId, tokenHash, hash, salt] = confirmMock.mock.calls[0].arguments;
      assert.equal(userId, 8);
      assert.equal(tokenHash, expectedHash);
      assert.equal(typeof hash, "string");
      assert.ok(hash.length > 0);
      assert.equal(typeof salt, "string");
      assert.ok(salt.length > 0);
    });
  });
});