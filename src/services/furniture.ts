/**
 * Core business logic for furniture management.
 *
 * ## Key invariants
 *
 * **Shared physical files** — when a furniture is duplicated via
 * `saveFurnitureFromExisting`, the new row reuses the same `local_name`
 * (the UUID filename on disk). Multiple `furniture` rows may therefore point
 * to the same physical zip file. The file is only deleted from disk once no
 * row references it, enforced by `countFurnitureSharingLocalName`.
 *
 * **Unique thumbnails** — thumbnails are never shared. Every furniture row
 * owns its own copy of the thumbnail file. `saveFurnitureFromExisting` always
 * copies the source thumbnail to a fresh UUID filename before inserting.
 *
 * **`local_name` vs `file_name`** — `local_name` is the name under which
 * the zip is stored on disk (assigned by multer, typically a UUID). `file_name`
 * is the original filename the uploader provided and is stored for display only.
 */

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
import { Kysely, Transaction, sql } from "kysely";

/** Allows service functions to be called both inside and outside a transaction. */
type Executor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

/**
 * Returns the number of `furniture` rows that share `localName` as their
 * physical file, excluding the row identified by `excludeId`.
 *
 * Used to determine whether it is safe to delete the physical zip file after
 * a row is removed or its `local_name` is updated.
 *
 * @param executor - A Kysely instance or an active transaction.
 * @param localName - The on-disk filename to search for.
 * @param excludeId - The `furniture.id` to exclude from the count (typically
 *   the row being deleted/replaced so it doesn't count itself).
 */
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

/**
 * Fetches a single furniture row by its primary key.
 *
 * @param id - The furniture's primary key.
 * @param options.ownerId - When provided, the query only succeeds if this user
 *   is listed in `furniture_owner`. Returns `undefined` for non-owners, making
 *   this safe to use as an ownership gate without a separate query.
 * @returns The furniture row, or `undefined` if not found (or not owned).
 */
export async function getFurnitureById(
  id: number,
  options?: { ownerId?: string }
) {
  const { ownerId } = options || {};

  let query = db.selectFrom("furniture").selectAll().where("id", "=", id);

  if (ownerId) {
    // SQLite requires at least one column in a correlated subquery SELECT;
    // selecting `id` satisfies that constraint while keeping the query minimal.
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("furniture_owner")
          .select(["id"])
          .whereRef("furniture_owner.furniture_id", "=", "furniture.id")
          .where("owner_id", "=", ownerId)
      )
    );
  }

  return await query.executeTakeFirst();
}

/**
 * Inserts a new `furniture` row and registers `ownerId` as its first owner,
 * both within a single atomic transaction.
 *
 * @param ownerId - PlayFab ID of the user uploading the furniture.
 * @param localName - The on-disk filename (UUID) assigned by multer.
 * @param fileName - The original filename provided by the uploader (display only).
 * @param thumbnail - Optional on-disk thumbnail filename; stored as a URL prefix
 *   (`/thumbnails/<filename>`) via `generateThumbnailURL`.
 * @param sceneBaseId - Optional PlayFab `SceneBaseID` of the room that owns
 *   this furniture; required for cross-platform reconciliation but stored as
 *   NULL when the client doesn't send it (older client builds).
 * @param pending - When `true`, the row is inserted with `committed=0` and
 *   the client must call `commitFurniture` after the corresponding PlayFab
 *   key has been written. Pending rows are eligible for sweeper cleanup
 *   after the configured age threshold. Defaults to `false` for backward
 *   compatibility.
 * @returns An object containing the new furniture's `id`.
 * @throws If the database insert fails.
 */
export async function saveFurniture(
  ownerId: string,
  localName: string,
  fileName: string,
  thumbnail?: string,
  sceneBaseId?: string,
  pending: boolean = false
) {
  const thumbnailURL = thumbnail ? generateThumbnailURL(thumbnail) : undefined;

  return await db.transaction().execute(async (trx) => {
    const furniture = await trx
      .insertInto("furniture")
      .values({
        local_name: localName,
        file_name: fileName,
        thumbnail: thumbnailURL,
        scene_base_id: sceneBaseId,
        committed: pending ? 0 : 1,
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

/**
 * Creates a new furniture row that shares the physical zip file of an existing
 * one (the `local_name` is reused, not copied). The thumbnail is handled
 * separately:
 *
 * - If `providedThumbnailFilename` is given (the claimer uploaded their own
 *   thumbnail), it is used as-is.
 * - Otherwise, the source thumbnail is copied to a new UUID filename so every
 *   row has its own independent thumbnail file.
 *
 * If the DB insert fails after a thumbnail copy was made, the orphan copy is
 * deleted as part of error cleanup.
 *
 * @param ownerId - PlayFab ID of the user claiming the duplicate.
 * @param source - The existing furniture row to duplicate.
 * @param providedThumbnailFilename - Optional thumbnail filename uploaded by
 *   the claimer; overrides copying the source thumbnail.
 * @param sceneBaseId - Optional PlayFab `SceneBaseID` of the *claimer's* room
 *   that the duplicate will live in (not the source's). Stored as NULL when
 *   the client doesn't send it.
 * @param extraInTx - Optional callback invoked inside the same transaction
 *   after the furniture row is inserted. Lets callers atomically combine the
 *   insert with related writes (e.g. consuming a duplicate token) so a crash
 *   between cannot leave the two systems out of sync. Throwing from the
 *   callback aborts the transaction and triggers thumbnail cleanup.
 * @returns An object containing the new furniture's `id`.
 * @throws Rethrows any DB error after attempting orphan thumbnail cleanup.
 */
export async function saveFurnitureFromExisting(
  ownerId: string,
  source: Furniture,
  providedThumbnailFilename?: string,
  sceneBaseId?: string,
  extraInTx?: (
    trx: Transaction<DatabaseSchema>,
    furnitureId: number
  ) => Promise<void>,
  pending: boolean = false
): Promise<{ id: number }> {
  let thumbnailFilename: string | undefined;
  let copiedThumbnail = false;

  if (providedThumbnailFilename) {
    thumbnailFilename = providedThumbnailFilename;
  } else if (source.thumbnail) {
    const sourceThumbnailName = removeThumbnailURL(source.thumbnail);
    thumbnailFilename = await copyThumbnail(sourceThumbnailName);
    // Track that we created this file so we can clean it up on insert failure.
    copiedThumbnail = true;
  }

  const thumbnailURL = thumbnailFilename
    ? generateThumbnailURL(thumbnailFilename)
    : undefined;

  try {
    return await db.transaction().execute(async (trx) => {
      const furniture = await trx
        .insertInto("furniture")
        .values({
          local_name: source.local_name,
          file_name: source.file_name,
          thumbnail: thumbnailURL,
          scene_base_id: sceneBaseId,
          committed: pending ? 0 : 1,
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

      if (extraInTx) await extraInTx(trx, furniture.id);

      return furniture;
    });
  } catch (err) {
    // The DB transaction failed. If we copied a thumbnail for this row, it is
    // now an orphan on disk. Best-effort cleanup — log and continue throwing.
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

/**
 * Returns all furniture rows owned by `ownerId`, ordered oldest-first.
 *
 * The result includes `id`, `file_name` (display name), and `thumbnail`
 * (URL string). It does not include `local_name` (the physical filename),
 * which is an internal implementation detail.
 *
 * @param ownerId - PlayFab ID of the requesting user.
 * @returns Array of furniture summaries (may be empty if the user owns none).
 */
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

/**
 * Deletes a furniture row and handles all cascading side effects:
 *
 * 1. **Transaction** — removes the `furniture` row (and its associated
 *    `furniture_owner` records via FK cascade). Also explicitly deletes any
 *    `duplicate_token` rows referencing this furniture so they don't linger.
 * 2. **Physical zip cleanup** — after the transaction, counts remaining rows
 *    that still reference the same `local_name`. If none remain, the physical
 *    zip file is deleted from disk.
 * 3. **Thumbnail cleanup** — the row's thumbnail (if any) is always deleted
 *    from disk because thumbnails are never shared between rows.
 *
 * File deletion errors are logged but do not cause this function to throw.
 *
 * @param furnitureId - Primary key of the furniture to delete.
 * @param options.ownerId - When provided, the delete is conditional: the row
 *   is only removed if this user is an owner. Returns `undefined` if the
 *   furniture was not found or not owned.
 * @returns The deleted row's `id`, `local_name`, and `thumbnail`, or
 *   `undefined` if nothing was deleted.
 */
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
      // SQLite requires at least one column in a correlated subquery SELECT.
      query = query.where(({ exists, selectFrom }) =>
        exists(
          selectFrom("furniture_owner")
            .select(["id"])
            .whereRef("furniture_owner.furniture_id", "=", "furniture.id")
            .where("owner_id", "=", ownerId)
        )
      );
    }

    const deleted = await query.executeTakeFirst();

    if (deleted) {
      // Explicitly delete tokens and their audit rows even though the FK
      // cascades would handle both — belt-and-suspenders, since SQLite ignores
      // FK constraints unless the foreign_keys pragma is on (which we don't
      // currently enable). Drop audit rows first so we never leave them
      // pointing at a non-existent token.
      await trx
        .deleteFrom("duplicate_token_claim")
        .where("token_id", "in", trx
          .selectFrom("duplicate_token")
          .select("id")
          .where("furniture_id", "=", furnitureId)
        )
        .execute();
      await trx
        .deleteFrom("duplicate_token")
        .where("furniture_id", "=", furnitureId)
        .execute();
    }

    return deleted;
  });

  if (furniture) {
    // The row is already deleted. Count remaining rows that still use the same
    // physical file (excludeId is a safety net; the deleted row won't appear).
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

    // Thumbnails are always unique per row, so always delete.
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

/**
 * Flips a furniture row from pending (`committed=0`) to committed
 * (`committed=1`). Idempotent — repeated calls are no-ops once the row is
 * already committed.
 *
 * The caller must own the row. The owner check + UPDATE happens in a single
 * statement so we don't need a separate transaction.
 *
 * @param furnitureId - Primary key of the row to commit.
 * @param ownerId - PlayFab ID of the caller; must be in `furniture_owner`.
 * @returns `true` if a row was matched (committed or already-committed).
 *   `false` if the id does not exist or the caller does not own it — the
 *   controller should respond 404.
 */
export async function commitFurniture(
  furnitureId: number,
  ownerId: string
): Promise<boolean> {
  const result = await db
    .updateTable("furniture")
    .set({ committed: 1 })
    .where("id", "=", furnitureId)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom("furniture_owner")
          .select(["id"])
          .whereRef("furniture_owner.furniture_id", "=", "furniture.id")
          .where("owner_id", "=", ownerId)
      )
    )
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0n) > 0;
}

/**
 * Returns the IDs of pending furniture rows older than `olderThanMinutes`,
 * the sweeper input. Selects only the id; `deleteFurnitureById` reads the
 * rest before deleting.
 */
export async function findUncommittedFurnitureOlderThan(
  olderThanMinutes: number
): Promise<number[]> {
  // Use SQLite's datetime() so the cutoff is computed inside the DB and we
  // never need to bind a JS Date (better-sqlite3 rejects Date as a parameter).
  const modifier = `-${olderThanMinutes} minutes`;
  const rows = await db
    .selectFrom("furniture")
    .select("id")
    .where("committed", "=", 0)
    .where("created_at", "<", sql<string>`datetime('now', ${modifier})`)
    .execute();
  return rows.map((r) => r.id);
}

/**
 * Replaces the physical zip file associated with a furniture row.
 *
 * Within a single transaction the function:
 * 1. Counts how many other rows still reference the old `local_name`.
 * 2. Updates the row to point to the new file.
 *
 * The shared-count check happens **inside** the transaction before the update
 * so it reflects the state before `local_name` changes. After the transaction,
 * if no other row was sharing the old file, it is deleted from disk.
 *
 * @param oldFurniture - The existing furniture row (used for its `id` and
 *   current `local_name`).
 * @param sourceLocalName - On-disk filename of the newly uploaded zip.
 * @param sourceFileName - Original filename of the newly uploaded zip (display only).
 */
export async function replaceFurnitureFile(
  oldFurniture: Furniture,
  sourceLocalName: string,
  sourceFileName: string
) {
  // Count before updating so we capture the sharing state of the OLD file.
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

/**
 * Copies `sourceThumbnail` (a filename relative to `THUMBNAIL_PATH`) to a new
 * file with a freshly generated UUID name, preserving the original extension.
 *
 * Used by `saveFurnitureFromExisting` to give each furniture row its own
 * independent thumbnail file even when the zip is shared.
 *
 * @param sourceThumbnail - Filename of the thumbnail to copy (not a full path).
 * @returns The filename of the newly created copy (not a full path).
 * @throws If the underlying `fs.copyFile` fails.
 */
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

/**
 * Replaces a furniture row's thumbnail file and updates the DB record.
 *
 * `sourceLocalName` is the temporary filename that multer wrote to
 * `THUMBNAIL_PATH`. The new file is moved to a fresh UUID name, then the
 * `furniture.thumbnail` column is updated, and only after the DB succeeds is
 * the old thumbnail deleted from disk.
 *
 * Ordering matters: if the DB update is performed before the new file is in
 * place, or if the old file is deleted before the DB update, a crash between
 * steps would leave the row referencing a missing file (a "zombie" row). With
 * this ordering the only failure mode is an orphan file on disk, which is
 * recoverable by reconciliation.
 *
 * @param oldFurniture - The existing furniture row (used for its `id` and
 *   current `thumbnail` URL).
 * @param sourceLocalName - The temporary on-disk filename of the new thumbnail
 *   (the name multer assigned on upload, before UUID renaming).
 * @throws If the `fs.rename` of the new thumbnail fails, or if the DB update
 *   fails (the just-renamed file is best-effort cleaned up before rethrowing).
 */
export async function replaceFurnitureThumbnail(
  oldFurniture: Furniture,
  sourceLocalName: string
) {
  const newThumbnailName = `${randomUUID()}${path.extname(sourceLocalName)}`;
  const tempName = path.join(THUMBNAIL_PATH, sourceLocalName);
  const newPath = path.join(THUMBNAIL_PATH, newThumbnailName);

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

  const thumbnailURL = generateThumbnailURL(newThumbnailName);
  try {
    await db
      .updateTable("furniture")
      .set("thumbnail", thumbnailURL)
      .where("id", "=", oldFurniture.id)
      .executeTakeFirst();
  } catch (err) {
    try {
      await deleteFile(newPath);
    } catch (cleanupErr) {
      console.error(
        `Failed to clean up orphan thumbnail ${newThumbnailName}: ${cleanupErr}`
      );
    }
    throw err;
  }

  if (oldFurniture.thumbnail) {
    const oldPath = path.join(
      THUMBNAIL_PATH,
      path.basename(oldFurniture.thumbnail)
    );
    try {
      await deleteFile(oldPath);
    } catch (err) {
      console.error(`Error deleting file ${oldFurniture.thumbnail}: ${err}`);
    }
  }
}

/**
 * Returns the list of owner IDs for a given furniture.
 *
 * @param furnitureId - Primary key of the furniture to look up.
 * @param options.ownerId - When provided, the result is gated on ownership:
 *   returns `undefined` if `ownerId` does not own the furniture.
 * @returns Array of PlayFab ID strings, or `undefined` if the furniture does
 *   not exist or has no owners.
 */
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
