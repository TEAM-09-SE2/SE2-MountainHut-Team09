import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffEmployees from "../../../src/pages/StaffEmployees";
import { fetchEmployees, createEmployee } from "../../../src/services/staffApi";

vi.mock("../../../src/services/staffApi", () => ({ fetchEmployees: vi.fn(), createEmployee: vi.fn() }));
vi.mock("../../../src/components/common/Navbar", () => ({ default: () => null }));
const { setUser } = vi.hoisted(() => ({ setUser: vi.fn() }));
vi.mock("../../../src/context/AuthContext", () => ({ useAuth: () => ({ setUser }) }));

const employee = { id: 7, email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", phone: null, mustChangePassword: true, createdAt: "2026-11-15T12:00:00Z" };
const error = (status, code) => Object.assign(new Error(code), { status, code });
beforeEach(() => {
  vi.resetAllMocks();
  fetchEmployees.mockResolvedValue([]);
  createEmployee.mockResolvedValue(employee);
});
afterEach(() => cleanup());

function open() {
  render(<MemoryRouter><StaffEmployees /></MemoryRouter>);
  return userEvent.setup();
}
function fill(fields = {}) {
  const values = { "First name": "Ada", "Last name": "Lovelace", Email: "ada@example.com", "Temporary password": "Temporary123!", ...fields };
  for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("StaffEmployees", () => {
  it("shows loading, then employee details and password status", async () => {
    let resolve;
    fetchEmployees.mockReturnValue(new Promise((done) => { resolve = done; }));
    open();
    expect(screen.getByText(/Loading employees/)).toBeInTheDocument();
    await act(async () => resolve([employee, { ...employee, id: 8, email: "grace@example.com", firstName: "Grace", mustChangePassword: false }]));
    const row = screen.getByTestId("employee-7");
    expect(within(row).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Temporary password")).toBeInTheDocument();
    expect(within(row).getByText("Added 15 Nov 2026")).toBeInTheDocument();
    expect(within(screen.getByTestId("employee-8")).getByText("Password changed")).toBeInTheDocument();
  });

  it("retries a failed list request", async () => {
    fetchEmployees.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([employee]);
    const user = open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the employees.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("employee-7")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    [{ "First name": " " }, "First name is required."],
    [{ "First name": "a".repeat(101) }, "First name cannot exceed 100 characters."],
    [{ "Last name": "" }, "Last name is required."],
    [{ "Last name": "a".repeat(101) }, "Last name cannot exceed 100 characters."],
    [{ Email: "invalid" }, "Please enter a valid email address."],
    [{ "Phone (optional)": "12-34" }, "Phone number can only contain digits."],
    [{ "Phone (optional)": "12345678901" }, "Phone number must be at most 10 digits."],
    [{ "Temporary password": "short" }, "The temporary password must have at least 8 characters."],
  ])("rejects invalid form values %j without calling the API", async (fields, message) => {
    const user = open();
    await screen.findByText("No employees yet");
    fill(fields);
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(createEmployee).not.toHaveBeenCalled();
  });

  it("trims optional phone, refreshes the list, and clears the form after creation", async () => {
    fetchEmployees.mockResolvedValueOnce([]).mockResolvedValueOnce([employee]);
    const user = open();
    await screen.findByText("No employees yet");
    fill({ "Phone (optional)": " 3331234567 " });
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByTestId("employee-7")).toBeInTheDocument();
    expect(createEmployee).toHaveBeenCalledWith({ email: employee.email, firstName: "Ada", lastName: "Lovelace", password: "Temporary123!", phone: "3331234567" });
    expect(screen.getByLabelText("Temporary password")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(within(screen.getByTestId("employee-7")).getByText("New")).toBeInTheDocument();
  });

  it("disables creation while the request is pending", async () => {
    let resolve;
    createEmployee.mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = open();
    await screen.findByText("No employees yet");
    fill();
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(screen.getByRole("button", { name: "Creating account..." })).toBeDisabled();
    await act(async () => resolve(employee));
    expect(await screen.findByRole("button", { name: "Create employee" })).toBeEnabled();
    expect(createEmployee).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, "FORBIDDEN_ROLE", "Only the warden can create employee accounts."],
    [400, "INVALID_INPUT", "Some values are not valid. Check the form and try again."],
    [500, "INTERNAL_ERROR", "We couldn't create the account right now. Please try again."],
  ])("shows creation error %s and retains entered values", async (status, code, message) => {
    createEmployee.mockRejectedValue(error(status, code));
    const user = open();
    await screen.findByText("No employees yet");
    fill();
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Email")).toHaveValue(employee.email);
    expect(screen.queryByText(/Account created for/)).not.toBeInTheDocument();
    expect(fetchEmployees).toHaveBeenCalledTimes(1);
  });

  it("clears the auth state if the creation session has expired", async () => {
    createEmployee.mockRejectedValue(error(401, "NOT_AUTHENTICATED"));
    const user = open();
    await screen.findByText("No employees yet");
    fill();
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null));
  });
});
