import { Router } from "express";
import {
  deleteFurnitureController,
  getFurnitureController,
  getFurnituresController,
  patchFurnitureFileController,
  patchFurnitureAddOwnerController,
  patchFurnitureThumbnailController,
  postFurnitureController,
  deleteFurnitureRemoveOwnerController,
  getFurnitureOwnersController,
} from "../controllers/furniture";
import { uploadFurniture, uploadFurnitureFile, uploadFurnitureThumbnail } from "../config/multer";
import { playfabMiddleware } from "../middlewares/playfab";

export function FurnitureRoutes() {
  const furnitureRouter = Router();

  furnitureRouter.use(playfabMiddleware);

  // Warn: I'm using only post method because the frontend is made using Unity C# and the developer can't use put method.
  furnitureRouter.get("/api/v1/furniture/:id", getFurnitureController);
  furnitureRouter.post("/api/v1/furniture", uploadFurniture, postFurnitureController);
  furnitureRouter.get("/api/v1/furnitures", getFurnituresController);
  furnitureRouter.delete("/api/v1/furniture/:id", deleteFurnitureController);
  furnitureRouter.post("/api/v1/furniture/:id/file", uploadFurnitureFile, patchFurnitureFileController);
  furnitureRouter.post("/api/v1/furniture/:id/thumbnail", uploadFurnitureThumbnail, patchFurnitureThumbnailController);
  furnitureRouter.post("/api/v1/furniture/:id/owner", patchFurnitureAddOwnerController);
  furnitureRouter.delete("/api/v1/furniture/:id/owner", deleteFurnitureRemoveOwnerController);
  furnitureRouter.get("/api/v1/furniture/:id/owners", getFurnitureOwnersController);

  return furnitureRouter;
}
