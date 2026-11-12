import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Home from "./pages/Home";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import BookTableWizard from "./components/booking/BookTableWizard";
import SlotCapacity from "./pages/SlotCapacity";
import CheckAvailability from "./pages/CheckAvailability";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/book-table"
            element={
              <ProtectedRoute allowedRoles={["hiker"]}>
                <BookTableWizard />
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
          <Route path="/availability" element={<CheckAvailability />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}