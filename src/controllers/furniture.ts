import { type RequestHandler } from "express";
import {
  createDuplicateToken,
  getDuplicateToken,
  consumeDuplicateToken,
} from "../services/duplicate-token";
import {
  deleteFurnitureById,
  getFurnitureById,
  getFurnitureOwners,
  getFurnituresByOwnerId,
  replaceFurnitureFile,
  replaceFurnitureThumbnail,
  saveFurniture,
} from "../services/furniture";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "../config/path";
import { type UploadedFiles } from "../config/multer";
import { deleteFile } from "../utils/file";
import { removeThumbnailURL } from "../utils/thumbnails";
import { ENV } from "../config/env";

export const getFurnitureController: RequestHandler<{ id: string }> = async (
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

export const postFurnitureController: RequestHandler = async (req, res) => {
  const playfab = (req as any).playfab;
  if (req.files) {
    try {
      const files = req.files as unknown as UploadedFiles;
      const file = files.file[0];
      const thumbnail = files.thumbnail?.[0];
      const furniture = await saveFurniture(
        playfab.id,
        file.filename,
        file.originalname,
        thumbnail?.filename
      );
      if (!furniture) {
        throw new Error("Failed to save furniture");
      }
      res.status(200).json({ id: furniture.id });
    } catch (error) {
      console.error(error);
      res.sendStatus(500);
      return;
    }
  }
};

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
    const furniture = await getFurnitureById(id);
    if (!furniture) {
      deleteFile(path.join(req.file.path));
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    replaceFurnitureFile(furniture, req.file.filename, req.file.originalname);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

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
    const furniture = await getFurnitureById(id);
    if (!furniture) {
      deleteFile(path.join(req.file.path));
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    await replaceFurnitureThumbnail(furniture, req.file.filename);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

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

// Persistent token: Owner requests a duplicate token for their furniture
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
    const furniture = await getFurnitureById(id);
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
    const furniture = await getFurnitureById(tokenData.furniture_id, {
      ownerId: tokenData.owner_id,
    });
    if (!furniture) {
      if (req.file) {
        deleteFile(path.join(req.file.path));
      }
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    const originalThumbnail = furniture.thumbnail
      ? removeThumbnailURL(furniture.thumbnail)
      : undefined;
    const thumbnail = req.file?.filename || originalThumbnail;
    const furnitureCreated = await saveFurniture(
      playfab.id,
      furniture.local_name,
      furniture.file_name,
      thumbnail
    );
    if (!furnitureCreated) {
      throw new Error("Failed to duplicate furniture");
    }
    await consumeDuplicateToken(token, playfab.id, Date.now());
    res.status(200).json({ id: furnitureCreated.id });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
};

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
