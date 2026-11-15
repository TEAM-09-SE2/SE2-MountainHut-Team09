import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ChangePasswordPage from "../../../src/components/auth/ChangePasswordPage";
import { changePassword } from "../../../src/services/authApi";

vi.mock("../../../src/services/authApi", () => ({ changePassword: vi.fn() }));
const { auth } = vi.hoisted(() => ({ auth: { user: null, setUser: vi.fn(), logout: vi.fn() } }));
vi.mock("../../../src/context/AuthContext", () => ({ useAuth: () => auth }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { id: 7, firstName: "Ada", role: "employee", mustChangePassword: true };
  changePassword.mockResolvedValue(null);
});
afterEach(() => cleanup());

function open(from) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/change-password", state: { from } }]}>
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/staff/slots" element={<p>Staff slots</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}
function fill(newPassword = "Permanent123!", confirmPassword = newPassword) {
  for (const [label, value] of [["Temporary password", "Temporary123!"], ["New password", newPassword], ["Confirm new password", confirmPassword]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe("ChangePasswordPage", () => {
  it.each([
    ["short", "short", "The new password must have at least 8 characters."],
    ["Temporary123!", "Temporary123!", "The new password must be different from the temporary password."],
    ["Permanent123!", "Different123!", "The passwords do not match."],
  ])("rejects invalid new password %s and confirmation %s", async (password, confirmation, message) => {
    const user = open();
    fill(password, confirmation);
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
    expect(auth.setUser).not.toHaveBeenCalled();
  });

  it("requires the current password before calling the API", async () => {
    const user = open();
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("Enter your temporary password.")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it.each([
    [400, "INVALID_INPUT", "Check the new password:"],
    [500, "INTERNAL_ERROR", "We couldn't change your password right now."],
  ])("shows server error %s without clearing the password-change requirement", async (status, code, message) => {
    changePassword.mockRejectedValue(Object.assign(new Error(code), { status, code }));
    const user = open();
    fill();
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(auth.setUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Password changed" })).not.toBeInTheDocument();
  });

  it("clears the auth state when the session has expired", async () => {
    changePassword.mockRejectedValue(Object.assign(new Error("expired"), { status: 401, code: "NOT_AUTHENTICATED" }));
    const user = open();
    fill();
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    await waitFor(() => expect(auth.setUser).toHaveBeenCalledWith(null));
  });

  it("disables submission until the password request finishes", async () => {
    let resolve;
    changePassword.mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = open();
    fill();
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await act(async () => resolve(null));
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledTimes(1);
    const updateUser = auth.setUser.mock.calls[0][0];
    expect(updateUser(auth.user)).toEqual({ ...auth.user, mustChangePassword: false });
  });

  it.each([undefined, "https://example.com", "//example.com", "/login", "/register?x=1", "/change-password"])(
    "returns home instead of redirecting to %s", async (from) => {
      const user = open(from);
      fill();
      await user.click(screen.getByRole("button", { name: "Save new password" }));
      await user.click(await screen.findByRole("button", { name: "Continue" }));
      expect(await screen.findByText("Home page")).toBeInTheDocument();
    },
  );
});
