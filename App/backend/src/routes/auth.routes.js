import express from "express";
import authController from "../controllers/auth.controller.js";
import { requireAuthAllowTemporaryPassword } from "../middlewares/auth.js";

const router = express.Router();

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);

// Protected routes
router.get("/me", requireAuthAllowTemporaryPassword, authController.me);
router.post("/logout", requireAuthAllowTemporaryPassword, authController.logout);
router.put("/password", requireAuthAllowTemporaryPassword, authController.changePassword);

export default router;
