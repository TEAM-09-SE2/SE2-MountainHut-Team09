import { Router } from "express";
import {createSlotController, getSlotByIdController} from "../controllers/slot.controllers.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

router.post("/", requireAuth, requireRole("employee", "warden"), createSlotController);
router.get("/:id", getSlotByIdController);

export default router;