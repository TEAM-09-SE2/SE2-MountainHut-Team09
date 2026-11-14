import express from "express";
import reservationController from "../controllers/reservation.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const reservationRouter = express.Router();

//api/v1/reservations
//Staff request the list of bookings with optional filters
reservationRouter.get(
  "/reservations",
  requireAuth,
  requireRole("employee", "warden"),
  reservationController.getStaffReservations,
);

//Only logged-in hikers can book: requireAuth reads the JWT cookie and sets req.user
reservationRouter.post(
  "/reservations",
  requireAuth,
  requireRole("hiker"),
  reservationController.createReservation,
);

export default reservationRouter;
