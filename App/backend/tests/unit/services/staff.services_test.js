import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import authRepository from "../../../src/database/auth.repository.js";
import staffRepository from "../../../src/database/staff.repository.js";
import { BadRequestError, ConflictError } from "../../../src/errors/ErrorClass.js";
import authService from "../../../src/services/auth.service.js";
import staffService from "../../../src/services/staff.service.js";
import { verifyPassword } from "../../../src/utils/cryptoUtils.js";

afterEach(() => {
  mock.reset();
});

const validEmployee = () => ({
  email: "employee@example.com",
  password: "Temporary123",
  firstName: "Ada",
  lastName: "Lovelace",
});

const repositoryUser = (user) => ({
  id: 12,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  emergencyContactName: user.emergencyContactName,
  emergencyContactPhone: user.emergencyContactPhone,
  notes: user.notes,
  role: user.role,
});

function mockSuccessfulCreation() {
  const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => null);
  const createUserMock = mock.method(authRepository, "createUser", async (user) => repositoryUser(user));
  return { findUserByEmailMock, createUserMock };
}

async function assertServiceError(promise, ErrorType, statusCode, code, message) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  });
}

describe("createEmployee_unit", () => {
  // Verifies a new employee is stored with normalized fields, role employee, the temporary password flag and a verifiable hash.
  it("creates an employee with normalized fields and a hashed temporary password", async () => {
    const { findUserByEmailMock, createUserMock } = mockSuccessfulCreation();

    const result = await staffService.createEmployee({
      ...validEmployee(),
      email: "  Employee@Example.COM ",
      firstName: " Ada ",
      lastName: " Lovelace ",
      phone: " 3331234567 ",
    });
    const savedUser = createUserMock.mock.calls[0].arguments[0];

    assert.deepEqual(result, {
      id: 12,
      email: "employee@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "3331234567",
      role: "employee",
      mustChangePassword: true,
    });
    assert.equal(findUserByEmailMock.mock.calls[0].arguments[0], "employee@example.com");
    assert.equal(createUserMock.mock.callCount(), 1);
    assert.equal(savedUser.role, "employee");
    assert.equal(savedUser.mustChangePassword, true);
    assert.equal(savedUser.emergencyContactName, null);
    assert.equal(savedUser.emergencyContactPhone, null);
    assert.equal(savedUser.notes, null);
    assert.equal(Object.hasOwn(savedUser, "password"), false);
    assert.equal(verifyPassword("Temporary123", savedUser.salt, savedUser.hash), true);
  });

  // Verifies the response never exposes the password, hash, salt or hiker-only fields.
  it("returns only the documented employee fields", async () => {
    mockSuccessfulCreation();

    const result = await staffService.createEmployee(validEmployee());

    assert.deepEqual(Object.keys(result).sort((a, b) => a.localeCompare(b)), ["email", "firstName", "id", "lastName", "mustChangePassword", "phone", "role"]);
  });

  // Verifies role and mustChangePassword sent by the client cannot change the stored account.
  it("ignores role and mustChangePassword values sent in the request", async () => {
    const { createUserMock } = mockSuccessfulCreation();

    const result = await staffService.createEmployee({ ...validEmployee(), role: "warden", mustChangePassword: false });
    const savedUser = createUserMock.mock.calls[0].arguments[0];

    assert.equal(savedUser.role, "employee");
    assert.equal(savedUser.mustChangePassword, true);
    assert.equal(result.role, "employee");
    assert.equal(result.mustChangePassword, true);
  });

  // Verifies a missing, null or blank phone is stored as null.
  it("stores a missing, null or blank phone as null", async () => {
    const { createUserMock } = mockSuccessfulCreation();

    for (const phone of [undefined, null, "", "   "]) {
      const result = await staffService.createEmployee({ ...validEmployee(), phone });
      assert.equal(result.phone, null);
    }

    assert.ok(createUserMock.mock.calls.every((call) => call.arguments[0].phone === null));
  });

  // Verifies the boundary values of the shared rules are accepted: 8-character password, 255-character email, 100-character names.
  it("accepts values exactly at the length limits", async () => {
    const { createUserMock } = mockSuccessfulCreation();
    const email = `${"a".repeat(243)}@example.com`;

    await staffService.createEmployee({ email, password: "12345678", firstName: "F".repeat(100), lastName: "L".repeat(100), phone: "1234567890" });

    assert.equal(email.length, 255);
    assert.equal(createUserMock.mock.callCount(), 1);
  });

  // Verifies hiker-only fields are rejected even when null or empty, without touching the repository.
  it("rejects emergency contact and notes fields, even when null or empty", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");
    const createUserMock = mock.method(authRepository, "createUser");

    for (const field of ["emergencyContactName", "emergencyContactPhone", "notes"]) {
      for (const value of ["value", "", null]) {
        await assertServiceError(
          staffService.createEmployee({ ...validEmployee(), [field]: value }),
          BadRequestError, 400, "INVALID_INPUT", `${field} is only available for hikers.`,
        );
      }
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
    assert.equal(createUserMock.mock.callCount(), 0);
  });

  // Verifies missing, non-string or malformed emails are rejected without touching the repository.
  it("rejects missing, non-string and malformed emails", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");

    for (const email of [undefined, null, "", 42, "not-an-email", "name@example"]) {
      await assertServiceError(staffService.createEmployee({ ...validEmployee(), email }), BadRequestError, 400, "INVALID_INPUT", "Invalid email format.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies the temporary password follows the password rule of at least 8 characters.
  it("rejects missing, non-string and short temporary passwords", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");

    for (const password of [undefined, null, "", 12345678, "1234567"]) {
      await assertServiceError(staffService.createEmployee({ ...validEmployee(), password }), BadRequestError, 400, "INVALID_INPUT", "Password must be at least 8 characters long.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies first and last name are both required and must be non-blank strings.
  it("rejects missing, blank and non-string first or last names", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");

    for (const firstName of [undefined, null, "", "   ", 42]) {
      await assertServiceError(staffService.createEmployee({ ...validEmployee(), firstName }), BadRequestError, 400, "INVALID_INPUT", "First name is required.");
    }
    for (const lastName of [undefined, null, "", "   ", 42]) {
      await assertServiceError(staffService.createEmployee({ ...validEmployee(), lastName }), BadRequestError, 400, "INVALID_INPUT", "Last name is required.");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies emails over 255 characters and names over 100 characters are rejected.
  it("rejects values over the length limits", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");
    const message = "Email must be at most 255 characters and names at most 100 characters long.";

    for (const fields of [{ email: `${"a".repeat(244)}@example.com` }, { firstName: "F".repeat(101) }, { lastName: "L".repeat(101) }]) {
      await assertServiceError(staffService.createEmployee({ ...validEmployee(), ...fields }), BadRequestError, 400, "INVALID_INPUT", message);
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies the optional phone follows the same rule as registration.
  it("rejects invalid phone numbers", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");

    for (const phone of ["12345678901", "333-123", "phone", 3331234567]) {
      await assertServiceError(staffService.createEmployee({ ...validEmployee(), phone }), BadRequestError, 400, "INVALID_INPUT");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });

  // Verifies an email already used by any account gives 409 EMAIL_ALREADY_USED and nothing is created.
  it("rejects an email that is already used", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail", async () => ({ id: 1, email: "employee@example.com", role: "hiker" }));
    const createUserMock = mock.method(authRepository, "createUser");

    await assertServiceError(
      staffService.createEmployee({ ...validEmployee(), email: " EMPLOYEE@example.com " }),
      ConflictError, 409, "EMAIL_ALREADY_USED", "An account with this email already exists.",
    );

    assert.equal(findUserByEmailMock.mock.calls[0].arguments[0], "employee@example.com");
    assert.equal(createUserMock.mock.callCount(), 0);
  });

  // Verifies a unique violation from a concurrent insert is reported as 409 EMAIL_ALREADY_USED.
  it("maps a unique-email violation during insert to a conflict", async () => {
    mock.method(authRepository, "findUserByEmail", async () => null);
    mock.method(authRepository, "createUser", async () => {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    });

    await assertServiceError(staffService.createEmployee(validEmployee()), ConflictError, 409, "EMAIL_ALREADY_USED");
  });

  // Verifies unexpected repository errors are passed on unchanged.
  it("propagates unexpected repository errors", async () => {
    const failure = new Error("database unavailable");
    mock.method(authRepository, "findUserByEmail", async () => null);
    mock.method(authRepository, "createUser", async () => { throw failure; });

    await assert.rejects(staffService.createEmployee(validEmployee()), (error) => error === failure);
  });
});

describe("listEmployees_unit", () => {
  // Verifies the service returns the employees exactly as the repository gives them.
  it("returns the employees from the repository", async () => {
    const employees = [
      { id: 3, email: "a@example.com", firstName: "Ada", lastName: "Alfa", phone: null, mustChangePassword: true, createdAt: new Date("2026-11-01T10:00:00Z") },
      { id: 4, email: "b@example.com", firstName: "Bea", lastName: "Beta", phone: "3331234567", mustChangePassword: false, createdAt: new Date("2026-11-02T10:00:00Z") },
    ];
    const listEmployeesMock = mock.method(staffRepository, "listEmployees", async () => employees);

    const result = await staffService.listEmployees();

    assert.deepEqual(result, employees);
    assert.equal(listEmployeesMock.mock.callCount(), 1);
  });

  // Verifies an empty list is returned when there are no employees.
  it("returns an empty list when there are no employees", async () => {
    mock.method(staffRepository, "listEmployees", async () => []);

    assert.deepEqual(await staffService.listEmployees(), []);
  });

  // Verifies repository errors are passed on unchanged.
  it("propagates repository errors", async () => {
    const failure = new Error("database unavailable");
    mock.method(staffRepository, "listEmployees", async () => { throw failure; });

    await assert.rejects(staffService.listEmployees(), (error) => error === failure);
  });
});

describe("registerUser_unit (shared account rules)", () => {
  // Verifies public registration, which shares the account rules with employee creation, still creates hikers with a permanent password.
  it("always registers a hiker with a permanent password", async () => {
    const { createUserMock } = mockSuccessfulCreation();

    const result = await authService.registerUser({ ...validEmployee(), role: "warden", mustChangePassword: true });
    const savedUser = createUserMock.mock.calls[0].arguments[0];

    assert.equal(savedUser.role, "hiker");
    assert.equal(savedUser.mustChangePassword, false);
    assert.equal(result.role, "hiker");
  });

  // Verifies the new length limits also apply to registration.
  it("rejects emails over 255 characters and names over 100 characters", async () => {
    const findUserByEmailMock = mock.method(authRepository, "findUserByEmail");

    for (const fields of [{ email: `${"a".repeat(244)}@example.com` }, { firstName: "F".repeat(101) }, { lastName: "L".repeat(101) }]) {
      await assertServiceError(authService.registerUser({ ...validEmployee(), ...fields }), BadRequestError, 400, "INVALID_INPUT");
    }

    assert.equal(findUserByEmailMock.mock.callCount(), 0);
  });
});
