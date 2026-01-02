import { Router } from "express";
import {
  deleteFurnitureController,
  getFurnitureController,
  getFurnituresController,
  patchFurnitureFileController,
  patchFurnitureAddOwnerController,
  patchFurnitureThumbnailController,
  postFurnitureController,
  deleteFurnitureAbandonOwnerController,
  getFurnitureOwnersController,
  postDuplicateFurnitureController,
  getFurnitureThumbnailController,
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
    furnitureRouter.post("/api/v1/duplicate-furniture/:id", uploadFurnitureThumbnail, postDuplicateFurnitureController);
    furnitureRouter.get("/api/v1/furnitures", getFurnituresController);
    furnitureRouter.delete("/api/v1/furniture/:id", deleteFurnitureController);
    furnitureRouter.post("/api/v1/furniture/:id/file", uploadFurnitureFile, patchFurnitureFileController);
    furnitureRouter.post("/api/v1/furniture/:id/thumbnail", uploadFurnitureThumbnail, patchFurnitureThumbnailController);
    furnitureRouter.post("/api/v1/furniture/:id/owner", patchFurnitureAddOwnerController);
    furnitureRouter.delete("/api/v1/furniture/:id/owner", deleteFurnitureAbandonOwnerController);
    furnitureRouter.get("/api/v1/furniture/:id/owners", getFurnitureOwnersController);
    furnitureRouter.get("/api/v1/furniture/:id/thumbnail", getFurnitureThumbnailController);
  }
  return furnitureRouter;
}
