import cors from "cors";
import express from "express";
import errorHandler from "./middlewares/ErrorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use(errorHandler);

export default app;
