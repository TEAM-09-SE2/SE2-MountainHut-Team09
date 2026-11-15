import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import staffController from "../controllers/staff.controller.js";

const router = Router();
router.use(requireAuth, requireRole("warden"));
router.post("/employees", staffController.createEmployee);
router.get("/employees", staffController.listEmployees);

export default router;
