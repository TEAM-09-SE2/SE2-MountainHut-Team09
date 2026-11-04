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
app.use("/api/v1", slotRouter);
app.use("/api/v1", reservationRouter);

app.use(errorHandler);

// TODO: remove when the Passport login is merged.
// Pretends a user is logged in: hiker 5 (Paolo, from the seed) unless the request sends
// the X-Dev-User-Id / X-Dev-User-Role headers. X-Dev-User-Id: none means not logged in.
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    const id = req.get("X-Dev-User-Id") ?? "5";
    if (id !== "none")
      req.user = {
        id: Number(id),
        role: req.get("X-Dev-User-Role") ?? "hiker",
      };
    next();
  });
}

app.use("/api/v1", slotRouter);
app.use("/api/v1", reservationRouter);

app.use(errorHandler);

export default app;
