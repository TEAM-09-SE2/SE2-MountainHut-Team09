import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LoginPage from "../../../src/components/auth/LoginPage";
import { loginUser } from "../../../src/services/authApi";

//No real backend: each test decides what the API returns
vi.mock("../../../src/services/authApi", () => ({
  loginUser: vi.fn(),
}));

//The page only needs setUser from the auth context
const setUser = vi.fn();
vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: () => ({ setUser }),
}));

const USER = { id: 7, email: "anna@example.com", firstName: "Anna", lastName: "Neri", role: "hiker" };

//Small pages for the possible destinations, so the test can see where the login sends the user
function renderLogin(state) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/availability" element={<p>Availability page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return user;
}

async function fillAndSubmit(user, email, password) {
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /Sign in/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("logs in, stores the returned user and goes to the home page", async () => {
    loginUser.mockResolvedValue(USER);
    const user = renderLogin();

    await fillAndSubmit(user, "anna@example.com", "Hiker123!");

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(loginUser).toHaveBeenCalledWith("anna@example.com", "Hiker123!");
    expect(setUser).toHaveBeenCalledWith(USER);
  });

  it("goes back to the page that sent the user to the login", async () => {
    loginUser.mockResolvedValue(USER);
    const user = renderLogin({ from: "/availability?date=2026-11-13&time=12:00&partySize=2" });

    await fillAndSubmit(user, "anna@example.com", "Hiker123!");

    expect(await screen.findByText("Availability page")).toBeInTheDocument();
  });

  it("ignores a redirect that is not a path of this site", async () => {
    loginUser.mockResolvedValue(USER);
    const user = renderLogin({ from: "https://evil.example.com" });

    await fillAndSubmit(user, "anna@example.com", "Hiker123!");

    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });

  it("does not call the API when the email is not valid", async () => {
    const user = renderLogin();

    await fillAndSubmit(user, "not-an-email", "Hiker123!");

    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(loginUser).not.toHaveBeenCalled();
  });

  it("does not call the API when the password is missing", async () => {
    const user = renderLogin();

    await fillAndSubmit(user, "anna@example.com", "");

    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(loginUser).not.toHaveBeenCalled();
  });

  it("shows the backend message on wrong credentials and stays on the page", async () => {
    loginUser.mockRejectedValue(
      Object.assign(new Error("Invalid email or password."), { status: 401, code: "INVALID_CREDENTIALS" }),
    );
    const user = renderLogin();

    await fillAndSubmit(user, "anna@example.com", "wrong-password1");

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeEnabled();
  });

  it("disables the button while the login is in progress", async () => {
    let finishLogin;
    loginUser.mockReturnValue(new Promise((resolve) => { finishLogin = resolve; }));
    const user = renderLogin();

    await fillAndSubmit(user, "anna@example.com", "Hiker123!");

    expect(screen.getByRole("button", { name: /Signing in/ })).toBeDisabled();
    finishLogin(USER);
    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });
});
