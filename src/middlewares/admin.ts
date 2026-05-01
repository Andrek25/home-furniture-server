import { type RequestHandler } from "express";
import { ENV } from "../config/env";

export const adminMiddleware: RequestHandler = (req, res, next) => {
  const key = req.headers["x-admin-key"];
  const token = Array.isArray(key) ? key[0] : key;
  if (!token || token !== ENV.PLAYFAB_DEVELOPER_SECRET_KEY) {
    res.sendStatus(401);
    return;
  }
  next();
};
