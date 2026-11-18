import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../../../src/database/connection.js";
import authRepository from "../../../src/database/auth.repository.js";
import { BadRequestError, ConflictError } from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";
import staffService from "../../../src/services/staff.service.js";
import { hashPassword, verifyPassword } from "../../../src/utils/cryptoUtils.js";

const TEST_EMAIL_PATTERN = "staff-repo-%@example.com";
const temporaryPassword = "Temporary123";

async function deleteTestUsers() {
  await pool.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_PATTERN]);
}

before(deleteTestUsers);

after(async () => {
  await deleteTestUsers();
  await pool.end();
});

const createTestEmail = () => `staff-repo-${randomUUID()}@example.com`;

const employeeInput = (fields = {}) => ({
  email: createTestEmail(),
  password: temporaryPassword,
  firstName: "Ada",
  lastName: "Lovelace",
  ...fields,
});

async function insertUser(role) {
  const { hash, salt } = hashPassword(temporaryPassword);
  return authRepository.createUser({ email: createTestEmail(), hash, salt, firstName: "Other", lastName: "User", role });
}

async function findRowByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM app_user WHERE email = $1", [email]);
  return rows;
}

describe("createEmployee repository and service integration", () => {
  // Verifies the stored row is an employee with a temporary password, a verifiable hash and no hiker-only data.
  it("stores a new employee with a temporary password", async () => {
    const input = employeeInput({ phone: "3331234567" });

    const employee = await staffService.createEmployee({ ...input, email: ` ${input.email.toUpperCase()} `, firstName: " Ada " });
    const [row] = await findRowByEmail(input.email);

    assert.deepEqual(employee, { id: row.id, email: input.email, firstName: "Ada", lastName: "Lovelace", phone: "3331234567", role: "employee", mustChangePassword: true });
    assert.equal(row.role, "employee");
    assert.equal(row.must_change_password, true);
    assert.equal(row.is_temporary, false);
    assert.equal(row.first_name, "Ada");
    assert.equal(row.emergency_contact_name, null);
    assert.equal(row.emergency_contact_phone, null);
    assert.equal(row.notes, null);
    assert.ok(row.created_at instanceof Date);
    assert.equal(verifyPassword(temporaryPassword, row.salt, row.password_hash), true);
  });

  // Verifies an email already used by an account of any role is rejected and no second row is created.
  it("rejects an email already used by a hiker, an employee or a warden", async () => {
    for (const role of ["hiker", "employee", "warden"]) {
      const existing = await insertUser(role);

      await assert.rejects(staffService.createEmployee(employeeInput({ email: existing.email.toUpperCase() })), (error) => {
        assert.ok(error instanceof ConflictError);
        assert.equal(error.code, "EMAIL_ALREADY_USED");
        return true;
      });

      const rows = await findRowByEmail(existing.email);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, role);
    }
  });

  // Verifies two concurrent creations with the same email produce one account and one 409.
  it("creates only one account for concurrent requests with the same email", async () => {
    const input = employeeInput();

    const results = await Promise.allSettled([staffService.createEmployee(input), staffService.createEmployee(input)]);
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, "EMAIL_ALREADY_USED");
    assert.equal((await findRowByEmail(input.email)).length, 1);
  });

  // Verifies rejected input leaves nothing in the database.
  it("does not store anything when the input is invalid", async () => {
    for (const fields of [{ notes: "Mountain guide" }, { password: "short" }, { firstName: "" }, { phone: "abc" }]) {
      const input = employeeInput(fields);

      await assert.rejects(staffService.createEmployee(input), BadRequestError);

      assert.equal((await findRowByEmail(input.email)).length, 0);
    }
  });
});

describe("listEmployees repository and service integration", () => {
  // Verifies the list has only employees, in last name, first name and id order, with the documented fields.
  it("lists only employees ordered by last name, first name and id", async () => {
    const warden = await insertUser("warden");
    const hiker = await insertUser("hiker");
    const created = [];
    for (const [firstName, lastName] of [["Zoe", "Zeta"], ["Bea", "Alfa"], ["Ada", "Alfa"], ["Ada", "Alfa"]]) {
      created.push(await staffService.createEmployee(employeeInput({ firstName, lastName })));
    }

    const employees = await staffService.listEmployees();
    const ours = employees.filter((employee) => created.some((user) => user.id === employee.id));

    assert.ok(employees.every((employee) => employee.id !== warden.id && employee.id !== hiker.id));
    assert.deepEqual(ours.map((employee) => employee.id), [created[2].id, created[3].id, created[1].id, created[0].id]);
    for (const employee of ours) {
      assert.deepEqual(Object.keys(employee).sort(), ["createdAt", "email", "firstName", "id", "lastName", "mustChangePassword", "phone"]);
      assert.equal(employee.mustChangePassword, true);
      assert.ok(employee.createdAt instanceof Date);
    }
  });

  // Verifies the list shows when an employee has replaced the temporary password.
  it("shows mustChangePassword false after the employee changes the password", async () => {
    const input = employeeInput();
    const employee = await staffService.createEmployee(input);

    await authService.changePassword(employee.id, { currentPassword: temporaryPassword, newPassword: "Permanent456" });
    const listed = (await staffService.listEmployees()).find((user) => user.id === employee.id);

    assert.equal(listed.mustChangePassword, false);
  });
});
