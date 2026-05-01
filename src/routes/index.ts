import { type Express } from "express";
import { FurnitureRoutes } from "../routes/furniture";
import { AdminRoutes } from "../routes/admin";

export function setupRoutes(app: Express) {
  app.use(AdminRoutes());
  app.use(FurnitureRoutes());
}
