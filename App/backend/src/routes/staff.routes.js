import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import staffController from "../controllers/staff.controller.js";

const router = Router();
router.post("/employees", requireAuth, requireRole("warden"), staffController.createEmployee);
router.get("/employees", requireAuth, requireRole("warden"), staffController.listEmployees);

export default router;
