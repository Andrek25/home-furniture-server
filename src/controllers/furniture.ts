import { type RequestHandler } from "express";
import {
  addFurnitureOwner,
  deleteFurnitureById,
  getFurnitureById,
  getFurnitureOwners,
  getFurnituresByOwnerId,
  removeFurnitureOwner,
  replaceFurnitureFile,
  replaceFurnitureThumbnail,
  saveFurniture,
} from "../services/furniture";
import path from "node:path";
import { FURNITURE_PATH } from "../config/path";
import { type UploadedFiles } from "../config/multer";
import { deleteFile } from "../utils/file";
import { checkIfPlayFabIdExists } from "../services/playfab";

export const getFurnitureController: RequestHandler<{ id: string }> = async (
  req,
  res
) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  const furniture = await getFurnitureById(id);
  if (!furniture) {
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
    const furniture = await getFurnitureById(id, { ownerId: playfab.id });
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
    const furniture = await getFurnitureById(id, { ownerId: playfab.id });
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

export const patchFurnitureAddOwnerController: RequestHandler<
  { id: string },
  any,
  { ownerId: string }
> = async (req, res) => {
  const id = Number(req.params.id);
  const { ownerId } = req.body;
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  const playfab = (req as any).playfab;
  try {
    const furnitureOwners = await getFurnitureOwners(id, { ownerId: playfab.id });
    if (!furnitureOwners) {
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    if (!(await checkIfPlayFabIdExists(ownerId))) {
      res.status(404).send("That user does not exist or it is invalid");
      return;
    }
    if (furnitureOwners.includes(ownerId)) {
      res.status(409).send("That user already owns this furniture");
      return;
    }
    const result = await addFurnitureOwner(id, ownerId);
    if (!result) {
      res.status(400).send("Failed to add owner");
      return;
    }
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

export const deleteFurnitureAbandonOwnerController: RequestHandler<{ id: string }> = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).send("You must provide a valid id");
    return;
  }
  const playfab = (req as any).playfab;
  try {
    const furnitureOwners = await getFurnitureOwners(id, { ownerId: playfab.id });
    if (!furnitureOwners) {
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    const result = await removeFurnitureOwner(id, playfab.id);
    if (!result) {
      res.status(400).send("Failed to abandon ownership");
      return;
    }
    if (furnitureOwners.length <= 1) {
      await deleteFurnitureById(id);
    }
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
};

export const getFurnitureOwnersController: RequestHandler<{ id: string }> = async (
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
    const furnitureOwners = await getFurnitureOwners(id, { ownerId: playfab.id });
    if (!furnitureOwners) {
      res.status(404).send("Furniture not found or you don't own it");
      return;
    }
    res.send({ furnitureId: id, owners: furnitureOwners });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
};