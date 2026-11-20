import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import authRepository from "../../../src/database/auth.repository.js";
import pool from "../../../src/database/connection.js";
import staffRepository from "../../../src/database/staff.repository.js";

afterEach(() => {
  mock.reset();
});

describe("staffRepository.listEmployees", () => {
  // Verifies only employees are selected, ordered by last name, first name and id, without hash or salt.
  it("selects only employees with the public fields in name order", async () => {
    const rows = [{ id: 3, email: "a@example.com", firstName: "Ada", lastName: "Alfa", phone: null, mustChangePassword: true, createdAt: new Date() }];
    const queryMock = mock.method(pool, "query", async () => ({ rows }));

    const result = await staffRepository.listEmployees();
    const sql = queryMock.mock.calls[0].arguments[0];

    assert.equal(result, rows);
    assert.equal(queryMock.mock.callCount(), 1);
    assert.match(sql, /WHERE role = 'employee'/);
    assert.match(sql, /ORDER BY last_name, first_name, id/);
    assert.match(sql, /must_change_password AS "mustChangePassword"/);
    assert.match(sql, /created_at AS "createdAt"/);
    assert.doesNotMatch(sql, /password_hash|salt/);
  });

  // Verifies database errors are passed on unchanged.
  it("propagates database errors", async () => {
    const failure = new Error("database unavailable");
    mock.method(pool, "query", async () => { throw failure; });

    await assert.rejects(staffRepository.listEmployees(), (error) => error === failure);
  });
});

describe("authRepository.createUser (employee)", () => {
  // Verifies the role and the temporary password flag are written to the new row.
  it("inserts the given role and must_change_password value", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [{ id: 12 }] }));

    const result = await authRepository.createUser({
      email: "employee@example.com", hash: "h".repeat(64), salt: "s".repeat(32), firstName: "Ada", lastName: "Lovelace",
      phone: "", role: "employee", mustChangePassword: true,
    });
    const [sql, params] = queryMock.mock.calls[0].arguments;

    assert.deepEqual(result, { id: 12 });
    assert.match(sql, /role, must_change_password/);
    assert.deepEqual(params, ["employee@example.com", "h".repeat(64), "s".repeat(32), "Ada", "Lovelace", null, null, null, null, "employee", true]);
  });

  // Verifies a new account gets a permanent password and role hiker when nothing else is given.
  it("defaults to a hiker with a permanent password", async () => {
    const queryMock = mock.method(pool, "query", async () => ({ rows: [{ id: 13 }] }));

    await authRepository.createUser({ email: "hiker@example.com", hash: "h", salt: "s", firstName: "Ada", lastName: "Lovelace" });
    const params = queryMock.mock.calls[0].arguments[1];

    assert.equal(params[9], "hiker");
    assert.equal(params[10], false);
  });
});
