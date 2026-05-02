/**
 * HTTP request handlers for all furniture-related routes.
 *
 * This layer sits between Express routes and the service layer. Each handler
 * is responsible for exactly three things:
 *  1. Validating and extracting input from the request.
 *  2. Calling the appropriate service function(s).
 *  3. Sending the HTTP response (or cleaning up uploaded files on failure).
 *
 * ## Auth pattern
 * Every handler receives the caller's PlayFab ID via `(req as any).playfab.id`.
 * The `playfab` object is attached by `playfabMiddleware` before the router
 * reaches these handlers. Express does not support typed request extensions
 * without module augmentation, so the `as any` cast is used throughout.
 *
 * ## Uploaded-file cleanup
 * Multer writes uploaded files to disk *before* the handler runs. If the
 * handler exits early (404 ownership check, DB error, etc.) it must manually
 * delete those files via `deleteFile` to avoid leaving orphans on disk.
 */

import { type RequestHandler } from "express";
import {
  createDuplicateToken,
  getDuplicateToken,
  consumeDuplicateToken,
} from "../services/duplicate-token";
import {
  commitFurniture,
  deleteFurnitureById,
  getFurnitureById,
  getFurnitureOwners,
  getFurnituresByOwnerId,
  replaceFurnitureFile,
  replaceFurnitureThumbnail,
  saveFurniture,
  saveFurnitureFromExisting,
} from "../services/furniture";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "../config/path";
import { type UploadedFiles } from "../config/multer";
import { deleteFile } from "../utils/file";
import { removeThumbnailURL } from "../utils/thumbnails";
import { ENV } from "../config/env";

/**
 * Coerces an arbitrary form-data value (always a string when present) into a
 * boolean for the `pending` two-phase-commit flag. Treats `"true"` and `"1"`
 * (case-insensitive) as true; everything else, including missing, is false.
 * Default-false matters for backward compatibility — old clients that don't
 * send the field upload as committed=1 and never need to call /commit.
 */
function parsePendingFlag(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * `GET /api/v1/furniture/:id`
 *
 * Streams the furniture's zip file to the caller. Any authenticated user may
 * fetch any furniture by ID — ownership is NOT checked here.
 *
 * Responds with:
 * - `400` if `:id` is not a valid integer.
 * - `404` if no furniture with that ID exists.
 * - `200` with the raw zip file on success.
 */
export const getFurnitureController: RequestHandler<{ id: string }> = async (
  req,
  res
) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  // playfab is available here (set by middleware) but ownership is not
  // enforced — this endpoint is intentionally public to authenticated users.
  const playfab = (req as any).playfab;
  try {
    const furniture = await getFurnitureById(id);
    if (!furniture) {
      res.status(404).send("Furniture not found");
      return;
    }
    res.sendFile(path.join(FURNITURE_PATH, furniture.local_name));
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
};

/**
 * `POST /api/v1/furniture`
 *
 * Uploads a new furniture. The caller becomes the sole owner. Expects a
 * `multipart/form-data` body with:
 * - `file` (required) — the zip file.
 * - `thumbnail` (optional) — an image file.
 *
 * If the DB save fails, any files already written to disk by multer are
 * deleted before responding.
 *
 * Responds with:
 * - `200` `{ id }` on success.
 * - `400` if the required `file` field is missing or was rejected by multer's
 *   filter (uploaded thumbnail, if any, is cleaned up).
 * - `500` on failure (uploaded files cleaned up).
 */
export const postFurnitureController: RequestHandler = async (req, res) => {
  const playfab = (req as any).playfab;
  // Multer's `.fields()` may leave `req.files` undefined, set fields to empty
  // arrays, or omit fields entirely when files were rejected by `fileFilter`.
  // Normalise all those cases so we always reach an explicit response.
  const files = (req.files ?? {}) as unknown as UploadedFiles;
  const file = files.file?.[0];
  const thumbnail = files.thumbnail?.[0];

  if (!file) {
    if (thumbnail) {
      await deleteFile(thumbnail.path).catch(() => {});
    }
    res.status(400).send("file required");
    return;
  }

  // Optional form field; coerced to undefined if missing or not a string so
  // multer/Express oddities (arrays, empty strings) don't end up in the DB.
  const rawSceneBaseId = (req.body as Record<string, unknown> | undefined)
    ?.scene_base_id;
  const sceneBaseId =
    typeof rawSceneBaseId === "string" && rawSceneBaseId.length > 0
      ? rawSceneBaseId
      : undefined;

  // P6 two-phase commit: when the client sends `pending=true` (or "1") it is
  // promising to call POST /api/v1/furniture/:id/commit after the
  // corresponding PlayFab key save completes. The row is created with
  // committed=0 and the sweeper deletes it if no commit arrives in time.
  const pending = parsePendingFlag(
    (req.body as Record<string, unknown> | undefined)?.pending
  );

  try {
    const furniture = await saveFurniture(
      playfab.id,
      file.filename,
      file.originalname,
      thumbnail?.filename,
      sceneBaseId,
      pending
    );
    if (!furniture) {
      throw new Error("Failed to save furniture");
    }
    res.status(200).json({ id: furniture.id });
  } catch (error) {
    console.error(error);
    // Multer already wrote these files; clean them up so they don't orphan.
    await deleteFile(file.path).catch(() => {});
    if (thumbnail) {
      await deleteFile(thumbnail.path).catch(() => {});
    }
    res.sendStatus(500);
    return;
  }
};

/**
 * `GET /api/v1/furnitures`
 *
 * Returns all furniture records owned by the authenticated caller, ordered
 * oldest-first.
 *
 * Responds with:
 * - `200` `{ furnitures: Array<{ id, file_name, thumbnail }> }` on success.
 * - `500` on DB failure.
 */
export const getFurnituresController: RequestHandler = async (req, res) => {
  const playfab = (req as any).playfab;
  try {
    const furnitures = await getFurnituresByOwnerId(playfab.id);
    res.send({ furnitures });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
};

/**
 * `DELETE /api/v1/furniture/:id`
 *
 * Deletes a furniture. The caller must own it. Cascades to on-disk file
 * cleanup via `deleteFurnitureById` (see that function for the shared-file
 * and thumbnail invariants).
 *
 * Responds with:
 * - `400` if `:id` is not a valid integer.
 * - `404` if the furniture is not found or the caller does not own it.
 * - `200` on success.
 * - `500` on unexpected failure.
 */
export const deleteFurnitureController: RequestHandler<{ id: string }> = async (
  req,
  res
) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  const playfab = (req as any).playfab;
  try {
    const furniture = await deleteFurnitureById(id, { ownerId: playfab.id });
    if (!furniture) {
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

/**
 * `POST /api/v1/furniture/:id/file`
 *
 * Replaces the zip file of an existing furniture. The caller must own it.
 * Named POST (not PATCH) because the Unity C# client does not support PATCH.
 *
 * Expects `multipart/form-data` with a single `file` field (zip).
 *
 * If the ownership check fails or a DB error occurs, the newly uploaded file
 * is deleted from disk before responding.
 *
 * Responds with:
 * - `400` if `:id` is invalid or no file was provided.
 * - `404` if the furniture is not found or not owned.
 * - `200` on success.
 * - `500` on unexpected failure (uploaded file cleaned up).
 */
export const patchFurnitureFileController: RequestHandler<{
  id: string;
}> = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  if (!req.file) {
    res.status(400).send("You must provide a file");
    return;
  }
  const playfab = (req as any).playfab;
  try {
    const furniture = await getFurnitureById(id, { ownerId: playfab.id });
    if (!furniture) {
      // Ownership check failed — multer already wrote the file, so clean up.
      await deleteFile(path.join(req.file.path)).catch(() => {});
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    await replaceFurnitureFile(
      furniture,
      req.file.filename,
      req.file.originalname
    );
  } catch (error) {
    console.error(error);
    if (req.file) {
      await deleteFile(req.file.path).catch(() => {});
    }
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

/**
 * `POST /api/v1/furniture/:id/thumbnail`
 *
 * Replaces the thumbnail of an existing furniture. The caller must own it.
 * Named POST (not PATCH) because the Unity C# client does not support PATCH.
 *
 * Expects `multipart/form-data` with a single `thumbnail` field (image).
 *
 * If the ownership check fails or a DB error occurs, the newly uploaded
 * thumbnail is deleted from disk before responding.
 *
 * Responds with:
 * - `400` if `:id` is invalid or no file was provided.
 * - `404` if the furniture is not found or not owned.
 * - `200` on success.
 * - `500` on unexpected failure (uploaded file cleaned up).
 */
export const patchFurnitureThumbnailController: RequestHandler<{
  id: string;
}> = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  if (!req.file) {
    res.status(400).send("You must provide a file");
    return;
  }
  const playfab = (req as any).playfab;
  try {
    const furniture = await getFurnitureById(id, { ownerId: playfab.id });
    if (!furniture) {
      // Ownership check failed — multer already wrote the file, so clean up.
      await deleteFile(path.join(req.file.path)).catch(() => {});
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    await replaceFurnitureThumbnail(furniture, req.file.filename);
  } catch (error) {
    console.error(error);
    if (req.file) {
      await deleteFile(req.file.path).catch(() => {});
    }
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

/**
 * `GET /api/v1/furniture/:id/owners`
 *
 * Returns all owner PlayFab IDs for a furniture. No ownership gate — any
 * authenticated user can query the owner list of any furniture.
 *
 * Responds with:
 * - `400` if `:id` is not a valid integer.
 * - `404` if the furniture does not exist.
 * - `200` `{ furnitureId, owners: string[] }` on success.
 * - `500` on unexpected failure.
 */
export const getFurnitureOwnersController: RequestHandler<{
  id: string;
}> = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  try {
    const furnitureOwners = await getFurnitureOwners(id);
    if (!furnitureOwners) {
      res.status(404).send("Furniture not found");
      return;
    }
    res.send({ furnitureId: id, owners: furnitureOwners });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
};

/**
 * `GET /api/v1/duplicate-furniture/:id`
 *
 * Generates a persistent duplicate token that allows other users to claim a
 * copy of this furniture. The caller must own it. Tokens are valid for
 * `DUPLICATE_TOKEN_EXPIRY` minutes (from `ENV`).
 *
 * Tokens are reusable — they are never deleted on claim, only marked as
 * consumed. An owner may generate multiple tokens for the same furniture.
 *
 * Responds with:
 * - `400` if `:id` is not a valid integer.
 * - `404` if the furniture is not found or not owned by the caller.
 * - `200` `{ token: string }` on success.
 * - `500` on unexpected failure.
 */
export const getDuplicateFurnitureController: RequestHandler<{
  id: string;
}> = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  const playfab = (req as any).playfab;
  try {
    const furniture = await getFurnitureById(id, { ownerId: playfab.id });
    if (!furniture) {
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    const expires = Date.now() + 1000 * 60 * ENV.DUPLICATE_TOKEN_EXPIRY;
    const token = await createDuplicateToken(id, playfab.id, expires);
    res.status(200).json({ token });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
};

/**
 * `POST /api/v1/duplicate-furniture/:token`
 *
 * Claims a duplicate token, creating a new furniture row for the caller that
 * shares the original's zip file. The claimer may optionally provide their own
 * thumbnail; if omitted, the source thumbnail is copied automatically.
 *
 * Ownership of the source furniture is verified against the token's stored
 * `owner_id` (the person who generated the token), not the caller's ID. This
 * ensures the source furniture still exists and belongs to the token issuer.
 *
 * The claim is appended to `duplicate_token_claim` and the token's
 * `consumed_by` / `consumed_at` columns are updated, but the token is NOT
 * deleted — tokens remain reusable.
 *
 * If the source furniture is missing or the save fails, any uploaded thumbnail
 * is deleted from disk before responding.
 *
 * Expects an optional `multipart/form-data` body with a `thumbnail` field.
 *
 * Responds with:
 * - `400` if the token param is missing or the token is not found in the DB.
 * - `404` if the source furniture no longer exists or is no longer owned by
 *   the token issuer.
 * - `200` `{ id }` with the new furniture's ID on success.
 * - `500` on unexpected failure (uploaded thumbnail cleaned up).
 */
export const postDuplicateFurnitureController: RequestHandler<{
  token: string;
}> = async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== "string") {
    res.status(400).send("Token required");
    return;
  }
  const tokenData = await getDuplicateToken(token);
  if (!tokenData) {
    res.status(400).send("Invalid token");
    return;
  }

  const playfab = (req as any).playfab;

  try {
    // Verify source furniture using the token issuer's ID, not the caller's —
    // the caller is claiming, not owning the source.
    const furniture = await getFurnitureById(tokenData.furniture_id, {
      ownerId: tokenData.owner_id,
    });
    if (!furniture) {
      if (req.file) {
        await deleteFile(path.join(req.file.path)).catch(() => {});
      }
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }

    // The claimer's room (where the duplicate will live) has its own
    // SceneBaseID, distinct from the source's. Coerce loose form values to
    // undefined so we never store empty strings.
    const rawSceneBaseId = (req.body as Record<string, unknown> | undefined)
      ?.scene_base_id;
    const sceneBaseId =
      typeof rawSceneBaseId === "string" && rawSceneBaseId.length > 0
        ? rawSceneBaseId
        : undefined;

    // Consume the token inside the same transaction as the clone insert so
    // a crash between cannot leave the new furniture row visible without the
    // token marked consumed (which would let the same claim be retried,
    // accumulating duplicate rows).
    const pending = parsePendingFlag(
      (req.body as Record<string, unknown> | undefined)?.pending
    );

    const furnitureCreated = await saveFurnitureFromExisting(
      playfab.id,
      furniture,
      req.file?.filename,
      sceneBaseId,
      async (trx, furnitureId) => {
        await consumeDuplicateToken(token, playfab.id, Date.now(), furnitureId, trx);
      },
      pending
    );
    res.status(200).json({ id: furnitureCreated.id });
  } catch (error) {
    console.error(error);
    if (req.file) {
      await deleteFile(path.join(req.file.path)).catch(() => {});
    }
    res.sendStatus(500);
    return;
  }
};

/**
 * `GET /api/v1/furniture/:id/thumbnail`
 *
 * Streams the thumbnail image for a furniture. No ownership check — any
 * authenticated user may fetch any furniture's thumbnail.
 *
 * Responds with:
 * - `400` if `:id` is not a valid integer.
 * - `404` if the furniture is not found or has no thumbnail.
 * - `200` with the raw image file on success.
 */
export const getFurnitureThumbnailController: RequestHandler<{
  id: string;
}> = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  try {
    const furniture = await getFurnitureById(id);
    if (!furniture) {
      res.status(404).send("Furniture not found");
      return;
    }
    // thumbnail is stored as a URL ("/thumbnails/<filename>"); strip the prefix
    // to get the bare filename needed for sendFile.
    const thumbnail = furniture.thumbnail
      ? removeThumbnailURL(furniture.thumbnail)
      : undefined;
    if (!thumbnail) {
      res.status(404).send("Furniture has no thumbnail");
      return;
    }
    res.sendFile(path.join(THUMBNAIL_PATH, thumbnail));
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
};

/**
 * `POST /api/v1/furniture/:id/commit`
 *
 * Marks a previously-pending furniture row as committed (P6 second phase).
 * The Unity client calls this after `POST /api/v1/furniture` (with
 * `pending=true`) and a successful `RoomDesign_<SceneBaseID>` write into
 * PlayFab. If commit never arrives, the sweeper deletes the row.
 *
 * Idempotent: calling commit on an already-committed row is a no-op success.
 *
 * Responds with:
 * - `400` if `:id` is not a valid integer.
 * - `404` if the row does not exist or the caller does not own it.
 * - `200` on success (or already committed).
 */
export const postCommitFurnitureController: RequestHandler<{ id: string }> =
  async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).send("You must provide a valid id");
      return;
    }
    const playfab = (req as any).playfab;
    try {
      const ok = await commitFurniture(id, playfab.id);
      if (!ok) {
        res.status(404).send("Furniture not found or you don't own it");
        return;
      }
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      res.sendStatus(500);
    }
  };
