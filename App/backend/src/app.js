import cors from "cors";
import express from "express";
import errorHandler from "./middlewares/ErrorHandler.js";
import availabilityRouter from "./routes/availability.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/v1", availabilityRouter);

app.use(errorHandler);

export default app;
