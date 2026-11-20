import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import App from "../../../src/App";
import { useAuth } from "../../../src/context/AuthContext";
import { fetchCurrentUser, loginUser, logoutUser, changePassword } from "../../../src/services/authApi";
import { fetchEmployees, createEmployee } from "../../../src/services/staffApi";

vi.mock("../../../src/services/authApi", () => ({
  fetchCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn(),
  changePassword: vi.fn(), registerUser: vi.fn(),
}));
vi.mock("../../../src/services/staffApi", () => ({ fetchEmployees: vi.fn(), createEmployee: vi.fn() }));
vi.mock("../../../src/pages/Home", () => ({ default: () => {
  const { user } = useAuth();
  return <p>Home {user?.role ?? "guest"} {String(user?.mustChangePassword)}</p>;
} }));
vi.mock("../../../src/pages/SlotCapacity", () => ({ default: () => <p>Staff slots</p> }));
vi.mock("../../../src/pages/MyBookings", () => ({ default: () => {
  const location = useLocation();
  return <p>Bookings {location.search}</p>;
} }));

const account = (role, mustChangePassword = false) => ({
  id: 7, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", role, mustChangePassword,
});
const apiError = (status, code) => Object.assign(new Error(code), { status, code });

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
  fetchCurrentUser.mockResolvedValue(null);
  fetchEmployees.mockResolvedValue([]);
  changePassword.mockResolvedValue(null);
  logoutUser.mockResolvedValue(null);
});
afterEach(() => cleanup());

function open(path, user) {
  fetchCurrentUser.mockResolvedValue(user);
  window.history.replaceState({}, "", path);
  render(<App />);
  return userEvent.setup();
}
async function fillPassword(user, forced = true) {
  await user.type(await screen.findByLabelText(forced ? "Temporary password" : "Current password"), "Temporary123!");
  await user.type(screen.getByLabelText("New password"), "Permanent123!");
  await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
  await user.click(screen.getByRole("button", { name: "Save new password" }));
}
async function fillEmployee(user) {
  await user.type(await screen.findByLabelText("First name"), " Ada ");
  await user.type(screen.getByLabelText("Last name"), " Lovelace ");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Temporary password"), "Temporary123!");
  await user.click(screen.getByRole("button", { name: "Create employee" }));
}

it("blocks anonymous employee management", async () => {
  open("/staff/employees", null);
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  expect(fetchEmployees).not.toHaveBeenCalled();
});
it.each(["employee", "hiker"])("blocks %s from employee management", async (role) => {
  open("/staff/employees", account(role));
  expect(await screen.findByText(`Home ${role} false`)).toBeInTheDocument();
  expect(fetchEmployees).not.toHaveBeenCalled();
});
it("creates an employee with trimmed fields and no hiker-only or empty phone fields", async () => {
  createEmployee.mockResolvedValue(account("employee", true));
  const user = open("/staff/employees", account("warden"));
  await fillEmployee(user);
  await waitFor(() => expect(createEmployee).toHaveBeenCalledWith({
    email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", password: "Temporary123!",
  }));
  expect(await screen.findByText(/Account created for/)).toBeInTheDocument();
  await waitFor(() => expect(fetchEmployees).toHaveBeenCalledTimes(2));
});
it("shows a duplicate email inline", async () => {
  createEmployee.mockRejectedValue(apiError(409, "EMAIL_ALREADY_USED"));
  const user = open("/staff/employees", account("warden"));
  await fillEmployee(user);
  expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
});
it("handles an expired employee-list session by returning to login", async () => {
  fetchEmployees.mockRejectedValue(apiError(401, "NOT_AUTHENTICATED"));
  open("/staff/employees", account("warden"));
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
});
it.each(["employee", "warden"])("forces %s password change before staff routes and then resumes", async (role) => {
  const user = open("/staff/slots", account(role, true));
  expect(await screen.findByRole("heading", { name: "Choose your password" })).toBeInTheDocument();
  expect(screen.queryByText("Staff slots")).not.toBeInTheDocument();
  await fillPassword(user);
  expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
  expect(changePassword).toHaveBeenCalledWith("Temporary123!", "Permanent123!");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Staff slots")).toBeInTheDocument();
});
it("preserves a hiker destination and query through a forced password change", async () => {
  const user = open("/my-bookings?status=active", account("hiker", true));
  await fillPassword(user);
  await user.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Bookings ?status=active")).toBeInTheDocument();
});
it("forces a fresh login with a temporary password into the change flow", async () => {
  loginUser.mockResolvedValue(account("employee", true));
  const user = open("/staff/slots", null);
  await user.type(await screen.findByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "Temporary123!");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Choose your password" })).toBeInTheDocument();
  await fillPassword(user);
  await user.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Staff slots")).toBeInTheDocument();
});
it("retains the forced flow after an incorrect temporary password", async () => {
  changePassword.mockRejectedValue(apiError(401, "INVALID_CREDENTIALS"));
  const user = open("/staff/slots", account("employee", true));
  await fillPassword(user);
  expect(await screen.findByText("The temporary password is not correct.")).toBeInTheDocument();
  expect(screen.queryByText("Staff slots")).not.toBeInTheDocument();
});
it("allows logout while a temporary password is active", async () => {
  const user = open("/", account("employee", true));
  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  expect(logoutUser).toHaveBeenCalledTimes(1);
});
it("allows voluntary password change and returns home", async () => {
  const user = open("/change-password", account("hiker"));
  await fillPassword(user, false);
  await user.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Home hiker false")).toBeInTheDocument();
});
