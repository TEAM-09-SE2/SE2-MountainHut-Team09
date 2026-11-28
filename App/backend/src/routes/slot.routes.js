import { Router } from "express";
import slotController from "../controllers/slot.controller.js";
import {
  createSlotController,
  getSlotByIdController,
  copyWeekController,
} from "../controllers/slot.controllers.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

//Mounted on /api/v1/slots
const router = Router();

//MH-01, public: slots of a day with their free seats (?date=YYYY-MM-DD)
router.get("/", slotController.getSlotsByDate);
//MH-02, staff only: create a slot, and read a slot with its tables
router.post(
  "/",
  requireAuth,
  requireRole("employee", "warden"),
  createSlotController,
);
//MH-09, staff only: copy the slots of a week into one or more following weeks
router.post(
  "/copy-week",
  requireAuth,
  requireRole("employee", "warden"),
  copyWeekController,
);
router.get(
  "/:id",
  requireAuth,
  requireRole("employee", "warden"),
  getSlotByIdController,
);

export default router;
