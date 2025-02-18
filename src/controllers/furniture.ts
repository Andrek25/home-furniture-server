import { type RequestHandler } from "express";
import {
  deleteFurnitureById,
  getFurnitureById,
  getFurnituresByOwnerId,
  replaceFurnitureFile,
  replaceFurnitureThumbnail,
  saveFurniture,
} from "../services/furniture";
import path from "node:path";
import { FURNITURE_PATH } from "../config/path";
import { type UploadedFiles } from "../config/multer";
import { deleteFile } from "../utils/file";

export const getFurnitureController: RequestHandler<{ id: string }> = async (
  req,
  res
) => {
  const id = Number(req.params.id);
  const playfab = (req as any).playfab;
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  const furniture = await getFurnitureById(id);
  if (!furniture) {
    res.status(404).send("Furniture not found");
    return;
  }
  if (furniture.owner_id !== playfab.id) {
    res.status(404).send("Furniture not found");
    return;
  }
  res.sendFile(path.join(FURNITURE_PATH, furniture.local_name));
};

export const postFurnitureController: RequestHandler = async (req, res) => {
  const playfab = (req as any).playfab;
  if (req.files) {
    try {
      const files = req.files as unknown as UploadedFiles;
      const file = files.file[0];
      const thumbnail = files.thumbnail?.[0];
      await saveFurniture(
        playfab.id,
        file.filename,
        file.originalname,
        thumbnail?.filename
      );
    } catch (error) {
      console.error(error);
      res.sendStatus(500);
      return;
    }
  }
  res.sendStatus(200);
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
    const furniture = await getFurnitureById(id);
    if (!furniture) {
      res.status(404).send("Furniture not found");
      return;
    }
    if (furniture.owner_id !== playfab.id) {
      res.status(404).send("Furniture not found");
      return;
    }
    await deleteFurnitureById(id, playfab.id);
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
      res.status(404).send("Furniture not found");
      return;
    }
    if (furniture.owner_id !== playfab.id) {
      deleteFile(path.join(req.file.path));
      res.status(404).send("Furniture not found");
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
      res.status(404).send("Furniture not found");
      return;
    }
    if (furniture.owner_id !== playfab.id) {
      deleteFile(path.join(req.file.path));
      res.status(404).send("Furniture not found");
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
