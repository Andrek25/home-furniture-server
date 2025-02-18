import { Router } from "express";
import {
  deleteFurnitureController,
  getFurnitureController,
  getFurnituresController,
  patchFurnitureFileController,
  patchFurnitureThumbnailController,
  postFurnitureController,
} from "../controllers/furniture";
import { uploadFurniture, uploadFurnitureFile, uploadFurnitureThumbnail } from "../config/multer";
import { playfabMiddleware } from "../middlewares/playfab";

export function FurnitureRoutes() {
  const furnitureRouter = Router();

  furnitureRouter.use(playfabMiddleware);

  furnitureRouter.get("/api/v1/furniture/:id", getFurnitureController);
  furnitureRouter.post("/api/v1/furniture", uploadFurniture, postFurnitureController);
  furnitureRouter.get("/api/v1/furnitures", getFurnituresController);
  furnitureRouter.delete("/api/v1/furniture/:id", deleteFurnitureController);
  furnitureRouter.post("/api/v1/furniture/:id/file", uploadFurnitureFile, patchFurnitureFileController);
  furnitureRouter.post("/api/v1/furniture/:id/thumbnail", uploadFurnitureThumbnail, patchFurnitureThumbnailController);

  return furnitureRouter;
}
