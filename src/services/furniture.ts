import { db } from "../config/db";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "../config/path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Furniture } from "../db/tables/furniture";
import { generateThumbnailURL } from "../utils/thumbnails";

export async function getFurnitureById(
  id: number,
  options?: { ownerId?: string }
) {
  const { ownerId } = options || {};

  let query = db.selectFrom("furniture").selectAll().where("id", "=", id);

  if (ownerId) {
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("furniture_owner")
          // This is required only for SQLite DB, which requires a column in the select
          .select(["id"])
          .whereRef("furniture_owner.furniture_id", "=", "furniture.id")
          .where("owner_id", "=", ownerId)
      )
    );
  }

  return await query.executeTakeFirst();
}

export async function saveFurniture(
  ownerId: string,
  localName: string,
  fileName: string,
  thumbnail?: string
) {
  const thumbnailURL = thumbnail ? generateThumbnailURL(thumbnail) : undefined;

  const furniture = await db
    .insertInto("furniture")
    .values({
      local_name: localName,
      file_name: fileName,
      thumbnail: thumbnailURL,
    })
    .returning("id")
    .executeTakeFirst();

  if (!furniture) throw new Error("Failed to save furniture");

  await db
    .insertInto("furniture_owner")
    .values({
      furniture_id: furniture.id,
      owner_id: ownerId,
    })
    .execute();

  return furniture;
}

export async function getFurnituresByOwnerId(ownerId: string) {
  const furnitures = await db
    .selectFrom("furniture")
    .innerJoin(
      "furniture_owner",
      "furniture.id",
      "furniture_owner.furniture_id"
    )
    .select(["furniture.id", "furniture.file_name", "furniture.thumbnail"])
    .where("furniture_owner.owner_id", "=", ownerId)
    .orderBy("furniture.created_at", "asc")
    .execute();

  return furnitures;
}

export async function deleteFurnitureById(
  furnitureId: number,
  options?: { ownerId?: string }
) {
  const { ownerId } = options || {};

  let query = db
    .deleteFrom("furniture")
    .where("id", "=", furnitureId)
    .returning([
      "id as id",
      "local_name as local_name",
      "thumbnail as thumbnail",
    ]);

  if (ownerId) {
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("furniture_owner")
          // This is required only for SQLite DB, which requires a column in the select
          .select(["id"])
          .whereRef("furniture_owner.furniture_id", "=", "furniture.id")
          .where("owner_id", "=", ownerId)
      )
    );
  }

  const furniture = await query.executeTakeFirst();

  if (furniture) {
    fs.unlink(path.join(FURNITURE_PATH, furniture.local_name), (err) => {
      if (err) {
        console.error(`Error deleting file ${furniture.local_name}: ${err}`);
      }
    });
    if (furniture.thumbnail) {
      fs.unlink(
        path.join(THUMBNAIL_PATH, path.basename(furniture.thumbnail)),
        (err) => {
          if (err) {
            console.error(
              `Error deleting thumbnail ${furniture.thumbnail}: ${err}`
            );
          }
        }
      );
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

export async function copyThumbnail(sourceThumbnail: string): Promise<string> {
  const ext = path.extname(sourceThumbnail);
  const newThumbnailName = `${randomUUID()}${ext}`;
  const sourcePath = path.join(THUMBNAIL_PATH, sourceThumbnail);
  const destPath = path.join(THUMBNAIL_PATH, newThumbnailName);

  await new Promise<void>((resolve, reject) => {
    fs.copyFile(sourcePath, destPath, (err) => {
      if (err) {
        console.error(`Error copying thumbnail: ${err}`);
        reject(err);
        return;
      }
      resolve();
    });
  });

  return newThumbnailName;
}

export async function replaceFurnitureThumbnail(
  oldFurniture: Furniture,
  sourceLocalName: string
) {
  const newThumbnailName = `${randomUUID()}${path.extname(sourceLocalName)}`;
  const tempName = path.join(THUMBNAIL_PATH, sourceLocalName);
  const newPath = path.join(THUMBNAIL_PATH, newThumbnailName);

  if (oldFurniture.thumbnail) {
    const oldPath = path.join(
      THUMBNAIL_PATH,
      path.basename(oldFurniture.thumbnail)
    );

    await new Promise<void>((resolve, reject) => {
      fs.unlink(oldPath, (err) => {
        if (err) {
          console.error(
            `Error deleting file ${oldFurniture.thumbnail}: ${err}`
          );
        }
        fs.rename(tempName, newPath, (err) => {
          if (err) {
            console.error(
              `Error moving thumbnail file: ${err}`
            );
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      fs.rename(tempName, newPath, (err) => {
        if (err) {
          console.error(`Error moving thumbnail file: ${err}`);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  const thumbnailURL = generateThumbnailURL(newThumbnailName);
  await db
    .updateTable("furniture")
    .set("thumbnail", thumbnailURL)
    .where("id", "=", oldFurniture.id)
    .executeTakeFirst();
}

export async function getFurnitureOwners(
  furnitureId: number,
  options?: { ownerId?: string }
) {
  const { ownerId } = options || {};

  if (ownerId) {
    const furniture = await getFurnitureById(furnitureId, { ownerId });
    if (!furniture) return undefined;
  }

  const furnitureOwners = await db
    .selectFrom("furniture_owner")
    .select(["owner_id"])
    .where("furniture_id", "=", furnitureId)
    .execute()
    .then((result) => result.map((row) => row.owner_id));

  return furnitureOwners.length > 0 ? furnitureOwners : undefined;
}
