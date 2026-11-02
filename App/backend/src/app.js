import cors from "cors";
import express from "express";
import slotRoutes from "./routes/slot.routes.js";
import errorHandler from "./middlewares/ErrorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/slots", slotRoutes);

app.use(errorHandler);

export default app;
