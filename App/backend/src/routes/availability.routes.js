import express from "express"
import availabilityController from "../controllers/availability.controllers.js"

const availabilityRouter = express.Router();

//api/v1/availability
availabilityRouter.get("/availability", availabilityController.checkAvailability);

export default availabilityRouter;

