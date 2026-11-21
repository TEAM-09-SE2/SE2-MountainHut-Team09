import path from "node:path";
import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.routes.js";
import errorHandler from "./middlewares/ErrorHandler.js";
import reservationRouter from "./routes/reservation.routes.js";
import slotRouter from "./routes/slot.routes.js";
import availabilityRouter from "./routes/availability.routes.js";
import staffRouter from "./routes/staff.routes.js";

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
app.use("/api/v1", availabilityRouter);
app.use("/api/v1", staffRouter);

// Docker image: this server also serves the built frontend (FRONTEND_DIST is set by App/docker/start.sh).
// In development it is unset and Vite serves the frontend on port 5173.
const frontendDist = process.env.FRONTEND_DIST;
if (frontendDist) {
  const root = path.resolve(frontendDist);
  app.use(express.static(root));
  // React Router pages (/login, /my-bookings, ...) load index.html; unknown /api paths still get a 404
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile("index.html", { root });
  });
}

app.use(errorHandler);

export default app;
