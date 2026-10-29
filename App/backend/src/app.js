import cors from "cors";
import express from "express";
import errorHandler from "./middlewares/ErrorHandler.js";
import reservationRouter from "./routes/reservation.routes.js";
import slotRouter from "./routes/slot.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

// TODO: remove when the Passport login is merged.
// Pretends a user is logged in: hiker 5 (Paolo, from the seed) unless the request sends
// the X-Dev-User-Id / X-Dev-User-Role headers. X-Dev-User-Id: none means not logged in.
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    const id = req.get("X-Dev-User-Id") ?? "5";
    if (id !== "none") req.user = { id: Number(id), role: req.get("X-Dev-User-Role") ?? "hiker" };
    next();
  });
}

app.use("/api/v1", slotRouter);
app.use("/api/v1", reservationRouter);

app.use(errorHandler);

export default app;
