import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.routes.js";
import errorHandler from "./middlewares/ErrorHandler.js";
import reservationRouter from "./routes/reservation.routes.js";
import slotRouter from "./routes/slot.routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

// Rotte API v1
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/slots", slotRouter);
app.use("/api/v1", reservationRouter);

app.use(errorHandler);

export default app;
