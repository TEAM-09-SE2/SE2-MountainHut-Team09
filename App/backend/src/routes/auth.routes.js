import express from "express";
import authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/employee/login", authController.employeeLogin);

// Protected routes
router.get("/me", requireAuth, authController.me);
router.post("/logout", requireAuth, authController.logout);

router.get(
  "/employee/dashboard",
  requireAuth,
  requireRole("employee", "warden"),
  authController.employeeDashboard
);

export default router;