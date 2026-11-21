import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// A user who still has a temporary password (an employee created by the warden, or a hiker
// account created by staff) must change it first: every page under this route sends them to
// /change-password, which then brings them back to the page they asked for
export default function PasswordChangeGate() {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.mustChangePassword) {
    // Right after login the gate fires while still on /login: keep the page the login was
    // going to open (its state.from), not the login page itself
    const from =
      location.pathname === "/login"
        ? location.state?.from
        : location.pathname + location.search;
    return <Navigate to="/change-password" replace state={{ from }} />;
  }

  return <Outlet />;
}
