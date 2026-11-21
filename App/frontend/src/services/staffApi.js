import { API_ORIGIN } from "../api/apiOrigin";

const API_BASE_URL = `${API_ORIGIN}/api/v1/staff`;

const handleResponse = async (response) => {
  if (response.status === 204) {
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || "An unexpected error occurred.");
    error.status = response.status;
    error.code = data?.error || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
};

/**
 * Warden only: the employee accounts, ordered by last name and first name.
 * Each one has mustChangePassword, true until the employee replaces the temporary password.
 */
export const fetchEmployees = async () => {
  const response = await fetch(`${API_BASE_URL}/employees`, {
    method: "GET",
    credentials: "include",
  });
  return handleResponse(response);
};

/**
 * Warden only: creates an employee with a temporary password.
 * @param {{email: string, firstName: string, lastName: string, phone?: string, password: string}} employee
 */
export const createEmployee = async (employee) => {
  const response = await fetch(`${API_BASE_URL}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(employee),
  });
  return handleResponse(response);
};
