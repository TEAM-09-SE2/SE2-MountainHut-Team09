import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Home from "./pages/Home";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import ForgotPasswordPage from "./components/auth/ForgotPasswordPage";
import ResetPasswordPage from "./components/auth/ResetPasswordPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PasswordChangeGate from "./components/auth/PasswordChangeGate";
import ChangePasswordPage from "./components/auth/ChangePasswordPage";
import BookTableWizard from "./components/booking/BookTableWizard";
import SlotCapacity from "./pages/SlotCapacity";
import CheckAvailability from "./pages/CheckAvailability";
import MyBookings from "./pages/MyBookings";
import ChangeBooking from "./pages/ChangeBooking";
import StaffEmployees from "./pages/StaffEmployees";
import StaffReserve from "./pages/StaffReserve";
import StaffBookings from "./pages/StaffBookings";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Any logged-in user; the only page open while the password is still temporary */}
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          {/* Every other page: a user with a temporary password is sent to /change-password */}
          <Route element={<PasswordChangeGate />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/book-table"
              element={
                <ProtectedRoute allowedRoles={["hiker"]}>
                  <BookTableWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute allowedRoles={["hiker"]}>
                  <MyBookings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bookings/:id/change"
              element={
                <ProtectedRoute allowedRoles={["hiker"]}>
                  <ChangeBooking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/slots"
              element={
                <ProtectedRoute allowedRoles={["employee", "warden"]}>
                  <SlotCapacity />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/reserve"
              element={
                <ProtectedRoute allowedRoles={["employee", "warden"]}>
                  <StaffReserve />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/bookings"
              element={
                <ProtectedRoute allowedRoles={["employee", "warden"]}>
                  <StaffBookings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/employees"
              element={
                <ProtectedRoute allowedRoles={["warden"]}>
                  <StaffEmployees />
                </ProtectedRoute>
              }
            />
            <Route path="/availability" element={<CheckAvailability />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
