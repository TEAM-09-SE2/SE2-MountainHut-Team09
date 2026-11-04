import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../../../src/components/auth/ProtectedRoute";
import { useAuth } from "../../../src/context/AuthContext";

//The real AuthContext asks the backend who is logged in: here we decide it in each test
vi.mock("../../../src/context/AuthContext", () => ({ useAuth: vi.fn() }));

//Opens /book-table protected for hikers, with fake login and home pages to see where we end up
function renderBookTableRoute() {
  render(
    <MemoryRouter initialEntries={["/book-table"]}>
      <Routes>
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route
          path="/book-table"
          element={
            <ProtectedRoute allowedRoles={["hiker"]}>
              <p>Booking wizard</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute on /book-table", () => {
  it("shows a loading message while the session is being checked", () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    renderBookTableRoute();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("sends a user who is not logged in to the login page", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderBookTableRoute();
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Booking wizard")).not.toBeInTheDocument();
  });

  it("sends an employee back to the home page", () => {
    useAuth.mockReturnValue({
      user: { id: 2, role: "employee" },
      loading: false,
    });
    renderBookTableRoute();
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("shows the wizard to a logged-in hiker", () => {
    useAuth.mockReturnValue({ user: { id: 5, role: "hiker" }, loading: false });
    renderBookTableRoute();
    expect(screen.getByText("Booking wizard")).toBeInTheDocument();
  });
});
