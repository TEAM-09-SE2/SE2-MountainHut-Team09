import { API_ORIGIN } from "../api/apiOrigin";

const API_BASE_URL = `${API_ORIGIN}/api/v1/auth`;

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
    error.code = data?.error || data?.errorCode || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
};

export const loginUser = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response);
};

export const registerUser = async (userData) => {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(userData),
  });
  return handleResponse(response);
};

export const fetchCurrentUser = async () => {
  const response = await fetch(`${API_BASE_URL}/me`, {
    method: "GET",
    credentials: "include",
  });
  return handleResponse(response);
};

export const logoutUser = async () => {
  const response = await fetch(`${API_BASE_URL}/logout`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse(response);
};

// Any logged-in user, also with a temporary password; the backend then clears mustChangePassword
export const changePassword = async (currentPassword, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleResponse(response);
};

// MH-07: public; always responds 202 so registered emails are not revealed
export const requestPasswordReset = async (email) => {
  const response = await fetch(`${API_BASE_URL}/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  return handleResponse(response);
};

// MH-07: public; validates token, sets new password, clears mustChangePassword and invalidates tokens
export const confirmPasswordReset = async (token, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token, newPassword }),
  });
  return handleResponse(response);
};