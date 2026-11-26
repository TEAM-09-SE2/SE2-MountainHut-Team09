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

//api/v1/me/reservations
//Only logged-in hikers can list their current and upcoming bookings (MH-06)
reservationRouter.get(
  "/me/reservations",
  requireAuth,
  requireRole("hiker"),
  reservationController.getMyReservations,
);

//api/v1/reservations/:id
//Only logged-in hikers can change their own booking; ownership is checked in the service (MH-06)
reservationRouter.patch(
  "/reservations/:id",
  requireAuth,
  requireRole("hiker"),
  reservationController.changeBooking,
);

//api/v1/reservations/:id/cancel
//Only logged-in hikers can cancel their own booking; ownership is checked in the service (MH-08)
reservationRouter.post(
  "/reservations/:id/cancel",
  requireAuth,
  requireRole("hiker"),
  reservationController.cancelMyBooking,
);

export default reservationRouter;
