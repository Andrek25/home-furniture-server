import { db, DatabaseSchema } from "../config/db";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "../config/path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Furniture } from "../db/tables/furniture";
import {
  generateThumbnailURL,
  removeThumbnailURL,
} from "../utils/thumbnails";
import { deleteFile } from "../utils/file";
import { Kysely, Transaction } from "kysely";

type Executor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

async function countFurnitureSharingLocalName(
  executor: Executor,
  localName: string,
  excludeId: number
): Promise<number> {
  const result = await executor
    .selectFrom("furniture")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("local_name", "=", localName)
    .where("id", "!=", excludeId)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

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

  return await db.transaction().execute(async (trx) => {
    const furniture = await trx
      .insertInto("furniture")
      .values({
        local_name: localName,
        file_name: fileName,
        thumbnail: thumbnailURL,
      })
      .returning("id")
      .executeTakeFirst();

    if (!furniture) throw new Error("Failed to save furniture");

    await trx
      .insertInto("furniture_owner")
      .values({
        furniture_id: furniture.id,
        owner_id: ownerId,
      })
      .execute();

    return furniture;
  });
}

export async function saveFurnitureFromExisting(
  ownerId: string,
  source: Furniture,
  providedThumbnailFilename?: string
): Promise<{ id: number }> {
  let thumbnailFilename: string | undefined;
  let copiedThumbnail = false;

  if (providedThumbnailFilename) {
    thumbnailFilename = providedThumbnailFilename;
  } else if (source.thumbnail) {
    const sourceThumbnailName = removeThumbnailURL(source.thumbnail);
    thumbnailFilename = await copyThumbnail(sourceThumbnailName);
    copiedThumbnail = true;
  }

  try {
    return await saveFurniture(
      ownerId,
      source.local_name,
      source.file_name,
      thumbnailFilename
    );
  } catch (err) {
    if (copiedThumbnail && thumbnailFilename) {
      try {
        await deleteFile(path.join(THUMBNAIL_PATH, thumbnailFilename));
      } catch (cleanupErr) {
        console.error(
          `Failed to clean up orphan thumbnail ${thumbnailFilename}: ${cleanupErr}`
        );
      }
    }
    throw err;
  }
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

  const furniture = await db.transaction().execute(async (trx) => {
    let query = trx
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

    const deleted = await query.executeTakeFirst();

    if (deleted) {
      await trx
        .deleteFrom("duplicate_token")
        .where("furniture_id", "=", furnitureId)
        .execute();
    }

    return deleted;
  });

  if (furniture) {
    const sharedCount = await countFurnitureSharingLocalName(
      db,
      furniture.local_name,
      furniture.id
    );

    if (sharedCount === 0) {
      try {
        await deleteFile(path.join(FURNITURE_PATH, furniture.local_name));
      } catch (err) {
        console.error(`Error deleting file ${furniture.local_name}: ${err}`);
      }
    }

    if (furniture.thumbnail) {
      try {
        await deleteFile(
          path.join(THUMBNAIL_PATH, path.basename(furniture.thumbnail))
        );
      } catch (err) {
        console.error(
          `Error deleting thumbnail ${furniture.thumbnail}: ${err}`
        );
      }
    }
  }

  return furniture;
}

export async function replaceFurnitureFile(
  oldFurniture: Furniture,
  sourceLocalName: string,
  sourceFileName: string
) {
  const sharedCount = await db.transaction().execute(async (trx) => {
    const count = await countFurnitureSharingLocalName(
      trx,
      oldFurniture.local_name,
      oldFurniture.id
    );

    await trx
      .updateTable("furniture")
      .set({
        local_name: sourceLocalName,
        file_name: sourceFileName,
      })
      .where("id", "=", oldFurniture.id)
      .execute();

    return count;
  });

  if (sharedCount === 0) {
    try {
      await deleteFile(path.join(FURNITURE_PATH, oldFurniture.local_name));
    } catch (err) {
      console.error(
        `Error deleting old file ${oldFurniture.local_name}: ${err}`
      );
    }
  }
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
            console.error(`Error moving thumbnail file: ${err}`);
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
