import { Router } from "express";
import {createSlotController, getSlotByIdController} from "../controllers/slot.controllers.js";

const router = Router();

// TODO: add authentication and staff authorization middleware.
router.post("/", createSlotController);
router.get("/:id", getSlotByIdController);

export default router;