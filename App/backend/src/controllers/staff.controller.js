import staffService from "../services/staff.service.js";
import { BadRequestError } from "../errors/ErrorClass.js";

async function createEmployee(req, res) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
    throw new BadRequestError("Request body is missing or empty.", "INVALID_INPUT");
  }
  const employee = await staffService.createEmployee(req.body);
  res.status(201).json(employee);
}

async function listEmployees(req, res) {
  res.status(200).json(await staffService.listEmployees());
}

export default { createEmployee, listEmployees };
