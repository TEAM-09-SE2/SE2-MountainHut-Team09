import { after, before, it, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import staffRouter from "../../../src/routes/staff.routes.js";
import authRepository from "../../../src/database/auth.repository.js";
import { requireAuth } from "../../../src/middlewares/auth.js";
import { requireRole } from "../../../src/middlewares/requireRole.js";
import errorHandler from "../../../src/middlewares/ErrorHandler.js";

const originalSecret = process.env.JWT_SECRET;
const secret = "staff-router-regression-secret";
let server;
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = secret;
  mock.method(authRepository, "findUserById", async (id) => ({
    id, role: id === 1 ? "employee" : "warden", mustChangePassword: false,
  }));
  const app = express();
  app.use(cookieParser());
  app.use("/api/v1/staff", staffRouter);
  // Other staff features may be registered after the employee-account router.
  const otherStaffRouter = express.Router();
  otherStaffRouter.use(requireAuth, requireRole("employee", "warden"));
  otherStaffRouter.get("/hikers", (req, res) => res.sendStatus(204));
  otherStaffRouter.post("/reservations", (req, res) => res.sendStatus(204));
  otherStaffRouter.post("/reservations/:id/cancel", (req, res) => res.sendStatus(204));
  app.use("/api/v1/staff", otherStaffRouter);
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/staff`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  mock.reset();
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

it("allows employees and wardens to reach other staff routers registered later", async () => {
  for (const id of [1, 2]) {
    const cookie = `token=${jwt.sign({ id }, secret)}`;
    for (const [path, method] of [["/hikers", "GET"], ["/reservations", "POST"], ["/reservations/1/cancel", "POST"]]) {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { cookie } });
      assert.equal(response.status, 204, `user ${id}: ${method} ${path}`);
    }
  }
});
