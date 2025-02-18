import { db } from "../config/db";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "../config/path";
import fs from "node:fs";
import { Furniture } from "../db/tables/furniture";
import { generateThumbnailURL } from "../utils/thumbnails";

export async function getFurnitureById(id: number) {
  return await db
    .selectFrom("furniture")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function saveFurniture(
  ownerId: string,
  localName: string,
  fileName: string,
  thumbnail?: string
) {
  const thumbnailURL = thumbnail ? generateThumbnailURL(thumbnail) : undefined;
  const id = await db
    .insertInto("furniture")
    .values({
      owner_id: ownerId,
      local_name: localName,
      file_name: fileName,
      thumbnail: thumbnailURL,
    })
    .returning("id")
    .executeTakeFirst();
  return id;
}

export async function getFurnituresByOwnerId(ownerId: string) {
  const furnitures = await db
    .selectFrom("furniture")
    .select(["id", "file_name", "thumbnail"])
    .where("owner_id", "=", ownerId)
    .orderBy("created_at", "asc")
    .execute();
  return furnitures;
}

export async function deleteFurnitureById(id: number, ownerId: string) {
  const furniture = await db
    .deleteFrom("furniture")
    .where("id", "=", id)
    .where("owner_id", "=", ownerId)
    .returning(["id as id", "local_name as local_name", "thumbnail as thumbnail"])
    .executeTakeFirst();

  if (furniture) {
    fs.unlink(path.join(FURNITURE_PATH, furniture.local_name), (err) => {
      if (err) {
        console.error(`Error deleting file ${furniture.local_name}: ${err}`);
      }
    });
    if (furniture.thumbnail) {
      fs.unlink(path.join(THUMBNAIL_PATH, path.basename(furniture.thumbnail)), (err) => {
        if (err) {
          console.error(`Error deleting thumbnail ${furniture.thumbnail}: ${err}`);
        }
      });
    }
  }

  return furniture;
}

export async function replaceFurnitureFile(
  oldFurniture: Furniture,
  sourceLocalName: string,
  sourceFileName: string
) {
  const originalName = path.join(FURNITURE_PATH, oldFurniture.local_name);
  const tempName = path.join(FURNITURE_PATH, sourceLocalName);

  await new Promise<void>((resolve, reject) => {
    fs.unlink(originalName, (err) => {
      if (err) {
        console.error(`Error deleting file ${oldFurniture.local_name}: ${err}`);
        reject(err);
      }
      fs.rename(tempName, originalName, (err) => {
        if (err) {
          console.error(
            `Error renaming file ${oldFurniture.local_name}: ${err}`
          );
          reject(err);
        }
        resolve();
      });
    });
  });

  if (oldFurniture.file_name === sourceFileName) return;
  await db
    .updateTable("furniture")
    .set("file_name", sourceFileName)
    .where("id", "=", oldFurniture.id)
    .executeTakeFirst();
}

export async function replaceFurnitureThumbnail(
  oldFurniture: Furniture,
  sourceLocalName: string
) {
  let thumbnailURL = "";

  if (oldFurniture.thumbnail) {
    const originalName = path.join(
      THUMBNAIL_PATH,
      path.basename(oldFurniture.thumbnail)
    );
    const tempName = path.join(THUMBNAIL_PATH, sourceLocalName);
    const originalNameWithoutExt = path.join(
      THUMBNAIL_PATH,
      path.parse(oldFurniture.thumbnail).name
    );

    await new Promise<void>((resolve, reject) => {
      fs.unlink(originalName, (err) => {
        if (err) {
          console.error(
            `Error deleting file ${oldFurniture.thumbnail}: ${err}`
          );
          reject(err);
        }
        fs.rename(
          tempName,
          `${originalNameWithoutExt}${path.extname(sourceLocalName)}`,
          (err) => {
            if (err) {
              console.error(
                `Error renaming file ${oldFurniture.thumbnail}: ${err}`
              );
              reject(err);
            }
            resolve();
          }
        );
      });
    });
    thumbnailURL = generateThumbnailURL(
      `${path.parse(oldFurniture.thumbnail).name}${path.extname(
        sourceLocalName
      )}`
    );
  } else {
    thumbnailURL = generateThumbnailURL(sourceLocalName);
  }

  if (oldFurniture.thumbnail === thumbnailURL) return;
  await db
    .updateTable("furniture")
    .set("thumbnail", thumbnailURL)
    .where("id", "=", oldFurniture.id)
    .executeTakeFirst();
}
