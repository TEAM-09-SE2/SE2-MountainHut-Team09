import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ForgotPasswordPage from "../../../src/components/auth/ForgotPasswordPage";
import { requestPasswordReset } from "../../../src/services/authApi";

vi.mock("../../../src/services/authApi", () => ({
  requestPasswordReset: vi.fn(),
}));

function open() {
  render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("ForgotPasswordPage", () => {
  it("rejects missing and malformed email addresses", async () => {
    const user = open();

    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("trims a valid email, disables submission, and shows the privacy-preserving success state", async () => {
    let resolve;
    requestPasswordReset.mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = open();

    await user.type(screen.getByLabelText("Email"), "  anna@example.com  ");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(requestPasswordReset).toHaveBeenCalledWith("anna@example.com");
    expect(screen.getByRole("button", { name: /Sending reset link/ })).toBeDisabled();

    resolve();
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText(/If an account exists for/)).toHaveTextContent(
      "anna@example.com",
    );
    expect(screen.getByText(/The link expires in 24 hours/)).toBeInTheDocument();
  });

  it("shows an API error and keeps the form available", async () => {
    requestPasswordReset.mockRejectedValue(new Error("Reset service unavailable."));
    const user = open();

    await user.type(screen.getByLabelText("Email"), "anna@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Reset service unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("provides navigation back to sign in after success", async () => {
    requestPasswordReset.mockResolvedValue({ message: "Accepted" });
    const user = open();

    await user.type(screen.getByLabelText("Email"), "anna@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await user.click(await screen.findByRole("link", { name: /Back to sign in/ }));
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });
});
