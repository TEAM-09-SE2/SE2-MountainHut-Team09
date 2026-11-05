import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../../../src/context/AuthContext";
import ProtectedRoute from "../../../src/components/auth/ProtectedRoute";

vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function renderStaffSlots() {
  return render(
    <MemoryRouter initialEntries={["/staff/slots"]}>
      <Routes>
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route
          path="/staff/slots"
          element={
            <ProtectedRoute allowedRoles={["employee", "warden"]}>
              <p>Slot capacity page</p>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SlotCapacity staff route integration", () => {
  it("redirects an unauthenticated visitor to login without requesting slot data", () => {
    useAuth.mockReturnValue({ user: null, loading: false });

    renderStaffSlots();

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("redirects a signed-in hiker away from the staff-only slot page", () => {
    useAuth.mockReturnValue({
      user: { id: 5, role: "hiker" },
      loading: false,
    });

    renderStaffSlots();

    expect(screen.getByText("Home page")).toBeInTheDocument();
    expect(screen.queryByText("Slot capacity page")).not.toBeInTheDocument();
  });
});
