import { createAccount } from "./auth.service.js";
import staffRepository from "../database/staff.repository.js";
import { BadRequestError } from "../errors/ErrorClass.js";

async function createEmployee(input) {
  for (const field of ["emergencyContactName", "emergencyContactPhone", "notes"]) {
    if (Object.hasOwn(input, field)) {
      throw new BadRequestError(`${field} is only available for hikers.`, "INVALID_INPUT");
    }
  }
  const { email, password, firstName, lastName, phone } = input;
  const user = await createAccount(
    { email, password, firstName, lastName, phone },
    { role: "employee", mustChangePassword: true },
  );
  return {
    id: user.id, email: user.email, firstName: user.firstName,
    lastName: user.lastName, phone: user.phone, role: user.role,
    mustChangePassword: true,
  };
}

async function listEmployees() {
  return staffRepository.listEmployees();
}

export default { createEmployee, listEmployees };
