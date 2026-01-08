import { Router } from "express";
import {
  deleteFurnitureController,
  getFurnitureController,
  getFurnituresController,
  patchFurnitureFileController,
  patchFurnitureThumbnailController,
  postFurnitureController,
  getFurnitureOwnersController,
  postDuplicateFurnitureController,
  getFurnitureThumbnailController,
  getDuplicateFurnitureController
} from "../controllers/furniture";
import {
  uploadFurniture,
  uploadFurnitureFile,
  uploadFurnitureThumbnail,
} from "../config/multer";
import { playfabMiddleware } from "../middlewares/playfab";

export function FurnitureRoutes() {
  const furnitureRouter = Router();

  furnitureRouter.use(playfabMiddleware);

  /* prettier-ignore */
  {
    // Warn: I'm using only post method because the frontend is made using Unity C# and the developer can't use put method.
    furnitureRouter.get("/api/v1/furniture/:id", getFurnitureController);
    furnitureRouter.post("/api/v1/furniture", uploadFurniture, postFurnitureController);
    furnitureRouter.get("/api/v1/duplicate-furniture/:id", getDuplicateFurnitureController);
    furnitureRouter.post("/api/v1/duplicate-furniture/:token", uploadFurnitureThumbnail, postDuplicateFurnitureController);
    furnitureRouter.get("/api/v1/furnitures", getFurnituresController);
    furnitureRouter.delete("/api/v1/furniture/:id", deleteFurnitureController);
    furnitureRouter.post("/api/v1/furniture/:id/file", uploadFurnitureFile, patchFurnitureFileController);
    furnitureRouter.post("/api/v1/furniture/:id/thumbnail", uploadFurnitureThumbnail, patchFurnitureThumbnailController);
    furnitureRouter.get("/api/v1/furniture/:id/owners", getFurnitureOwnersController);
    furnitureRouter.get("/api/v1/furniture/:id/thumbnail", getFurnitureThumbnailController);
  }
  return furnitureRouter;
}
