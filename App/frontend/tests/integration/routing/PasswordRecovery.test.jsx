import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../../src/App";

const API_BASE_URL = "http://localhost:4000/api/v1/auth";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  fetch.mockImplementation(async (url) => {
    if (String(url) === `${API_BASE_URL}/me`) {
      return jsonResponse(null);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MH-07 password recovery integration", () => {
  it("links from login to forgot-password and submits the public recovery request", async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url) === `${API_BASE_URL}/me`) return jsonResponse(null);
      if (String(url) === `${API_BASE_URL}/password-reset/request`) {
        expect(options).toMatchObject({ method: "POST", credentials: "include" });
        expect(JSON.parse(options.body)).toEqual({ email: "anna@example.com" });
        return jsonResponse({ message: "Accepted" }, 202);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    window.history.replaceState({}, "", "/login");
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: "Forgot password?" }));
    expect(await screen.findByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "anna@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText(/anna@example.com/)).toBeInTheDocument();
  });

  it("confirms a reset link token through the public API and opens sign-in", async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url) === `${API_BASE_URL}/me`) return jsonResponse(null);
      if (String(url) === `${API_BASE_URL}/password-reset/confirm`) {
        expect(options).toMatchObject({ method: "POST", credentials: "include" });
        expect(JSON.parse(options.body)).toEqual({
          token: "reset-token",
          newPassword: "Permanent123!",
        });
        return jsonResponse({ message: "Password reset" });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    window.history.replaceState({}, "", "/reset-password?token=reset-token");
    render(<App />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Go to sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("shows invalid reset tokens and provides a route to request another email", async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url) === `${API_BASE_URL}/me`) return jsonResponse(null);
      if (String(url) === `${API_BASE_URL}/password-reset/confirm`) {
        return jsonResponse(
          { error: "INVALID_RESET_TOKEN", message: "Invalid or expired reset token." },
          400,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    window.history.replaceState({}, "", "/reset-password?token=expired-token");
    render(<App />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("New password"), "Permanent123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Permanent123!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText(
      "This reset link is invalid, expired, or has already been used.",
    )).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Request a new reset link" }));
    expect(await screen.findByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument();
  });

  it("renders a missing-token reset page without calling the confirm API", async () => {
    window.history.replaceState({}, "", "/reset-password");
    render(<App />);

    expect(await screen.findByText(/This reset link is invalid or incomplete/)).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/password-reset/confirm")),
    ).toBe(false);
  });

  it("preserves the privacy-preserving response for unknown and known emails", async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url) === `${API_BASE_URL}/me`) return jsonResponse(null);
      if (String(url) === `${API_BASE_URL}/password-reset/request`) {
        return jsonResponse({ message: "If an account exists, a reset email was sent." }, 202);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    window.history.replaceState({}, "", "/forgot-password");
    render(<App />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/password-reset/request`,
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
  });
});
