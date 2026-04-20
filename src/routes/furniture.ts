/**
 * Express router factory for all furniture-related API routes.
 *
 * Every route in this file is protected by `playfabMiddleware`, which
 * validates the `X-PlayFab-Auth-Token` header and attaches `req.playfab.id`
 * before any controller runs.
 *
 * ## POST instead of PATCH/PUT
 * Replace operations (`/file`, `/thumbnail`) use POST rather than the
 * semantically correct PATCH because Unity's `UnityWebRequest` does not
 * support PATCH or PUT. All mutation routes therefore use POST.
 *
 * ## Route table
 * | Method | Path | Multer | Controller |
 * |--------|------|--------|------------|
 * | GET    | /api/v1/furnitures | — | `getFurnituresController` |
 * | POST   | /api/v1/furniture | `uploadFurniture` | `postFurnitureController` |
 * | GET    | /api/v1/furniture/:id | — | `getFurnitureController` |
 * | DELETE | /api/v1/furniture/:id | — | `deleteFurnitureController` |
 * | POST   | /api/v1/furniture/:id/file | `uploadFurnitureFile` | `patchFurnitureFileController` |
 * | POST   | /api/v1/furniture/:id/thumbnail | `uploadFurnitureThumbnail` | `patchFurnitureThumbnailController` |
 * | GET    | /api/v1/furniture/:id/owners | — | `getFurnitureOwnersController` |
 * | GET    | /api/v1/furniture/:id/thumbnail | — | `getFurnitureThumbnailController` |
 * | GET    | /api/v1/duplicate-furniture/:id | — | `getDuplicateFurnitureController` |
 * | POST   | /api/v1/duplicate-furniture/:token | `uploadFurnitureThumbnail` | `postDuplicateFurnitureController` |
 */

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

/**
 * Creates and returns the Express router that handles all `/api/v1/furniture*`
 * and `/api/v1/duplicate-furniture*` routes.
 *
 * Called once by `setupRoutes` in `src/routes/index.ts` and mounted directly
 * on the top-level Express app (no path prefix — routes declare their full
 * paths explicitly).
 */
export function FurnitureRoutes() {
  const furnitureRouter = Router();

  // All routes in this router require a valid PlayFab session ticket.
  furnitureRouter.use(playfabMiddleware);

  /* prettier-ignore */
  {
    // Replace operations use POST instead of PATCH/PUT — Unity's UnityWebRequest
    // does not support those HTTP methods.
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
