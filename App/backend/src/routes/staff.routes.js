import express from "express";
import hikersController from "../controllers/hikers.controller.js";
import staffReservationsController from "../controllers/staffReservations.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const staffRouter = express.Router();

staffRouter.get(
  "/staff/hikers",
  requireAuth,
  requireRole("employee", "warden"),
  hikersController.searchHikers,
);

staffRouter.post(
  "/staff/reservations",
  requireAuth,
  requireRole("employee", "warden"),
  staffReservationsController.createReservation,
);

export default staffRouter;
