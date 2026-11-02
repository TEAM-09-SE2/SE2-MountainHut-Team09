const API_BASE_URL = "http://localhost:4000/api/v1/auth";

const handleResponse = async (response) => {
  if (response.status === 204) return null;
  
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.message || "An error occurred.";
    const errorCode = data.error || "UNKNOWN_ERROR";
    const error = new Error(errorMessage);
    error.code = errorCode;
    throw error;
  }

  return data;
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

export const loginUser = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response);
};

export const loginEmployee = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/employee/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
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