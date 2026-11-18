import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import authRepository from "../../../src/database/auth.repository.js";
import pool from "../../../src/database/connection.js";

afterEach(() => {
  mock.reset();
});

describe("authRepository.findCredentialsById", () => {
  // Verifies only hash and salt of a non-temporary account are read.
  it("returns the hash and salt of a regular account", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [{ password_hash: "hash", salt: "salt" }] }));

    const result = await authRepository.findCredentialsById(7);
    const [sql, params] = queryMock.mock.calls[0].arguments;

    assert.deepEqual(result, { password_hash: "hash", salt: "salt" });
    assert.deepEqual(params, [7]);
    assert.match(sql, /SELECT password_hash, salt FROM app_user/);
    assert.match(sql, /is_temporary = false/);
  });

  // Verifies null is returned when no row matches.
  it("returns null when the account does not exist", async () => {
    mock.method(pool, "query", async () => ({ rows: [] }));

    assert.equal(await authRepository.findCredentialsById(7), null);
  });
});

describe("authRepository.updatePassword", () => {
  // Verifies the update saves hash and salt, clears the flag and only matches the previous hash.
  it("updates hash and salt, clears the flag and reports success", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rowCount: 1 }));

    const result = await authRepository.updatePassword(7, "old-hash", "new-hash", "new-salt");
    const [sql, params] = queryMock.mock.calls[0].arguments;

    assert.equal(result, true);
    assert.deepEqual(params, [7, "old-hash", "new-hash", "new-salt"]);
    assert.match(sql, /SET password_hash = \$3, salt = \$4, must_change_password = false/);
    assert.match(sql, /WHERE id = \$1 AND password_hash = \$2 AND is_temporary = false/);
  });

  // Verifies false is returned when the previous hash no longer matches.
  it("reports failure when no row is updated", async () => {
    mock.method(pool, "query", async () => ({ rowCount: 0 }));

    assert.equal(await authRepository.updatePassword(7, "old-hash", "new-hash", "new-salt"), false);
  });
});

describe("authRepository temporary password flag", () => {
  // Verifies login and session lookups both read must_change_password.
  it("selects must_change_password in findUserByEmail and findUserById", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [] }));

    assert.equal(await authRepository.findUserByEmail("employee@example.com"), null);
    assert.equal(await authRepository.findUserById(7), null);

    for (const call of queryMock.mock.calls) {
      assert.match(call.arguments[0], /must_change_password AS "mustChangePassword"/);
    }
  });
});
