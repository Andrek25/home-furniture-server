import { type Express } from "express";
import { FurnitureRoutes } from "../routes/furniture";

export function setupRoutes(app: Express) {
  app.use(FurnitureRoutes());
}
