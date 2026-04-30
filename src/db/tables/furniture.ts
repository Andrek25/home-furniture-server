/**
 * Kysely table definition and derived types for the `furniture` table.
 *
 * ## Critical invariant — shared `local_name`
 * `local_name` is the name of the physical zip file on disk under
 * `FURNITURE_PATH`. When a furniture is duplicated via
 * `saveFurnitureFromExisting`, the new row reuses the same `local_name` as
 * the source — **multiple rows can point to the same file**. The file is only
 * deleted from disk once no row references it. Never update `local_name`
 * directly; always go through `replaceFurnitureFile` which handles the
 * reference-count check atomically.
 *
 * ## Thumbnail URL format
 * `thumbnail` stores a URL string (`/thumbnails/<filename>`), not a bare
 * filename. Use `generateThumbnailURL` / `removeThumbnailURL` from
 * `src/utils/thumbnails.ts` to convert between the two representations.
 * Unlike `local_name`, thumbnails are **never shared** — each row owns its
 * own copy of the file.
 */

import {
  Insertable,
  Updateable,
  type Generated,
  type Selectable,
} from "kysely";

/**
 * Raw Kysely table interface for `furniture`. Use the derived types below
 * (`Furniture`, `NewFurniture`, `FurnitureUpdate`) in application code.
 */
export interface FurnitureTable {
  /** Auto-incrementing primary key. */
  id: Generated<number>;
  /**
   * On-disk filename of the zip archive under `FURNITURE_PATH` (e.g.
   * `"550e8400-e29b-41d4-a716-446655440000.zip"`). Multiple rows may share
   * the same value — see the module docblock for the shared-file invariant.
   */
  local_name: string;
  /**
   * Original filename supplied by the uploader (e.g. `"living-room.zip"`).
   * Stored for display only; has no relation to the on-disk path.
   */
  file_name: string;
  /**
   * URL of the thumbnail image (e.g. `"/thumbnails/<uuid>.png"`), or absent
   * if the furniture has no thumbnail. Unique per row — never shared between
   * furniture records.
   */
  thumbnail?: string;
  /**
   * The PlayFab `SceneBaseID` of the room that originally contained this
   * furniture (used to form the `RoomDesign_<SceneBaseID>` PlayFab key).
   *
   * Recorded server-side so the server can answer "is this row still
   * referenced by any PlayFab room?" without enumerating PlayFab via admin
   * API. Nullable: rows uploaded before the column was added (or by clients
   * that don't send the field) have NULL here and are excluded from
   * cross-platform reconciliation.
   */
  scene_base_id?: string;
  /**
   * Two-phase commit flag (P6). `0` = pending: the client uploaded but has
   * not yet confirmed the cross-platform write (PlayFab key save) succeeded.
   * `1` = committed: the row is permanent. Defaults to `1` on insert so
   * clients that haven't adopted the protocol behave as before. The sweeper
   * (`scripts/sweep-uncommitted.ts`) deletes pending rows older than the
   * configured threshold.
   *
   * Stored as INTEGER 0/1 because SQLite has no native boolean. Treated as
   * a boolean in TypeScript via `0 | 1`.
   */
  committed?: 0 | 1;
  /** Row creation timestamp, set automatically by the database. */
  created_at?: Date;
  /** Row last-updated timestamp, set automatically by the database. */
  updated_at?: Date;
}

/** A row selected from `furniture`. All generated/optional columns are present. */
export type Furniture = Selectable<FurnitureTable>;

/** Shape for inserting a new `furniture` row. `id`, `created_at`, and
 *  `updated_at` are omitted — the database supplies them. */
export type NewFurniture = Insertable<FurnitureTable>;

/** Shape for updating an existing `furniture` row. All columns are optional. */
export type FurnitureUpdate = Updateable<FurnitureTable>;
