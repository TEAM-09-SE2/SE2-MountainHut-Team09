import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResetPasswordPage from "../../../src/components/auth/ResetPasswordPage";
import { confirmPasswordReset } from "../../../src/services/authApi";

vi.mock("../../../src/services/authApi", () => ({
  confirmPasswordReset: vi.fn(),
}));

function open(token) {
  const entry = token === undefined
    ? "/reset-password"
    : `/reset-password?token=${encodeURIComponent(token)}`;
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/forgot-password" element={<p>Forgot password page</p>} />
        <Route path="/login" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("ResetPasswordPage", () => {
  it("shows an incomplete-link state and offers a fresh reset request", async () => {
    const user = open();

    expect(screen.getByText(/This reset link is invalid or incomplete/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Request a new reset link" }));
    expect(await screen.findByText("Forgot password page")).toBeInTheDocument();
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const user = open("valid-token");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "short");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByText("New password must be at least 8 characters long.")).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const user = open("valid-token");
    await user.type(screen.getByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Different123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("confirms a valid token and password, then links to sign in", async () => {
    confirmPasswordReset.mockResolvedValue({ message: "Password reset" });
    const user = open("valid-token");

    await user.type(screen.getByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
    expect(confirmPasswordReset).toHaveBeenCalledWith("valid-token", "Permanent123!");
    await user.click(screen.getByRole("link", { name: "Go to sign in" }));
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });

  it("disables submission while saving", async () => {
    let resolve;
    confirmPasswordReset.mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = open("valid-token");

    await user.type(screen.getByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByRole("button", { name: /Saving password/ })).toBeDisabled();
    resolve();
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows invalid-expired-token feedback and a recovery link", async () => {
    confirmPasswordReset.mockRejectedValue(
      Object.assign(new Error("invalid"), { code: "INVALID_RESET_TOKEN" }),
    );
    const user = open("expired-token");

    await user.type(screen.getByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText(
      "This reset link is invalid, expired, or has already been used.",
    )).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new reset link" })).toBeInTheDocument();
  });

  it("shows a generic API error for other reset failures", async () => {
    confirmPasswordReset.mockRejectedValue(new Error("Could not reach the reset service."));
    const user = open("valid-token");

    await user.type(screen.getByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Could not reach the reset service.")).toBeInTheDocument();
  });
});
