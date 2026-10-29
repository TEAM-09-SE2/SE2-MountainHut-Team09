import express from "express";
import slotController from "../controllers/slot.controller.js";

const slotRouter = express.Router();

//api/v1/slots?date=YYYY-MM-DD
slotRouter.get("/slots", slotController.getSlotsByDate);

export default slotRouter;
