import express from "express";
import reservationController from "../controllers/reservation.controller.js";
import { hasRole, isLoggedIn } from "../middlewares/auth.js";

const reservationRouter = express.Router();

//api/v1/reservations
//Only logged-in hikers can book
reservationRouter.post(
  "/reservations",
  isLoggedIn,
  hasRole("hiker"),
  reservationController.createReservation,
);

export default reservationRouter;
