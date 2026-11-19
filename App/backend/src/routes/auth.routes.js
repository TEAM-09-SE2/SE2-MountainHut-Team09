import express from "express";
import authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/password-reset/request", authController.requestPasswordReset);
router.post("/password-reset/confirm", authController.confirmPasswordReset);

// Protected routes
router.get("/me", requireAuth, authController.me);
router.post("/logout", requireAuth, authController.logout);

export default router;