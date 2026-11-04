import jwt from "jsonwebtoken";
import authService from "../services/auth.service.js";
import { BadRequestError } from "../errors/ErrorClass.js";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }
  return secret;
};

const checkRequestBody = (req) => {
  if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
    throw new BadRequestError("Request body is missing or empty.", "INVALID_INPUT");
  }
};

const sendAuthTokenCookie = (res, user) => {
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: "1d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
};

async function register(req, res, next) {
  try {
    checkRequestBody(req);
    const user = await authService.registerUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    checkRequestBody(req);
    const user = await authService.loginUser(req.body);
    sendAuthTokenCookie(res, user);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  const { id, email, firstName, lastName, role } = req.user;
  res.status(200).json({ id, email, firstName, lastName, role });
}

function logout(req, res) {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(204).end();
}

export default {
  register,
  login,
  me,
  logout,
};