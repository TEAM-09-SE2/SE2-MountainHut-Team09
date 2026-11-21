import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import staffController from "../../../src/controllers/staff.controller.js";
import { BadRequestError, ConflictError } from "../../../src/errors/ErrorClass.js";
import staffService from "../../../src/services/staff.service.js";

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

const validBody = () => ({ email: "employee@example.com", password: "Temporary123", firstName: "Ada", lastName: "Lovelace" });

const createdEmployee = () => ({
  id: 12,
  email: "employee@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: null,
  role: "employee",
  mustChangePassword: true,
});

describe("staffController.createEmployee", () => {
  // Verifies a created employee is returned with HTTP 201 and the body is passed to the service unchanged.
  it("returns 201 with the created employee", async () => {
    const body = validBody();
    const createEmployeeMock = mock.method(staffService, "createEmployee", async () => createdEmployee());
    const res = createResponse();

    await staffController.createEmployee({ body }, res);

    assert.equal(createEmployeeMock.mock.callCount(), 1);
    assert.equal(createEmployeeMock.mock.calls[0].arguments[0], body);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, createdEmployee());
  });

  // Verifies missing, empty and non-object bodies are rejected without calling the service.
  it("rejects missing, empty and invalid request bodies", async () => {
    const createEmployeeMock = mock.method(staffService, "createEmployee");

    for (const body of [undefined, null, {}, [], [validBody()], "invalid", 42]) {
      const res = createResponse();

      await assert.rejects(staffController.createEmployee({ body }, res), (error) => {
        assert.ok(error instanceof BadRequestError);
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, "INVALID_INPUT");
        return true;
      });
      assert.equal(res.status.mock.callCount(), 0);
    }

    assert.equal(createEmployeeMock.mock.callCount(), 0);
  });

  // Verifies service errors reach the error handler and no response is sent.
  it("propagates service errors without sending a response", async () => {
    const conflict = new ConflictError("An account with this email already exists.", "EMAIL_ALREADY_USED");
    mock.method(staffService, "createEmployee", async () => { throw conflict; });
    const res = createResponse();

    await assert.rejects(staffController.createEmployee({ body: validBody() }, res), (error) => error === conflict);

    assert.equal(res.status.mock.callCount(), 0);
    assert.equal(res.json.mock.callCount(), 0);
  });
});

describe("staffController.listEmployees", () => {
  // Verifies the employee list is returned with HTTP 200.
  it("returns 200 with the employees", async () => {
    const employees = [{ id: 3, email: "a@example.com", firstName: "Ada", lastName: "Alfa", phone: null, mustChangePassword: true, createdAt: "2026-11-01T10:00:00.000Z" }];
    const listEmployeesMock = mock.method(staffService, "listEmployees", async () => employees);
    const res = createResponse();

    await staffController.listEmployees({}, res);

    assert.equal(listEmployeesMock.mock.callCount(), 1);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, employees);
  });

  // Verifies an empty list is still a 200 response.
  it("returns 200 with an empty list", async () => {
    mock.method(staffService, "listEmployees", async () => []);
    const res = createResponse();

    await staffController.listEmployees({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  // Verifies service errors reach the error handler and no response is sent.
  it("propagates service errors without sending a response", async () => {
    const failure = new Error("database unavailable");
    mock.method(staffService, "listEmployees", async () => { throw failure; });
    const res = createResponse();

    await assert.rejects(staffController.listEmployees({}, res), (error) => error === failure);

    assert.equal(res.json.mock.callCount(), 0);
  });
});
