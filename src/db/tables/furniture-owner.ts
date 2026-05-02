/**
 * Kysely table definition and derived types for the `furniture_owner` table.
 *
 * `furniture_owner` is a join table that implements a many-to-many relationship
 * between `furniture` rows and PlayFab user IDs. A furniture can have multiple
 * owners (e.g. a user duplicates a piece of furniture, making both the original
 * owner and the claimer owners of rows that share the same `local_name`).
 * A single user can own many furniture items.
 *
 * ## Uniqueness constraint
 * The pair `(furniture_id, owner_id)` has a unique index
 * (`idx_furniture_owner_unique`, added in migration `1739436042231`). Inserting
 * a duplicate pair throws a constraint error — `saveFurniture` relies on this
 * to prevent double-ownership from concurrent requests.
 *
 * ## Cascade delete
 * `furniture_id` has a foreign key referencing `furniture(id) ON DELETE CASCADE`,
 * so owner rows are removed automatically when the parent furniture is deleted.
 */

import {
  Insertable,
  Updateable,
  type Generated,
  type Selectable,
} from "kysely";

/**
 * Raw Kysely table interface for `furniture_owner`. Use the derived types below
 * (`FurnitureOwner`, `NewFurnitureOwner`, `FurnitureOwnerUpdate`) in
 * application code.
 */
export interface FurnitureOwnerTable {
  /** Auto-incrementing primary key. */
  id: Generated<number>;
  /**
   * Foreign key referencing `furniture.id`. Deleting the furniture row
   * cascades to delete all associated owner rows.
   */
  furniture_id: number;
  /**
   * PlayFab ID of the owning user. Not a foreign key — PlayFab is the
   * authoritative source for user existence, not the local database.
   */
  owner_id: string;
  /** Row creation timestamp, set automatically by the database. */
  created_at?: Date;
}

/** A row selected from `furniture_owner`. All generated/optional columns are present. */
export type FurnitureOwner = Selectable<FurnitureOwnerTable>;

/** Shape for inserting a new `furniture_owner` row. `id` and `created_at`
 *  are omitted — the database supplies them. */
export type NewFurnitureOwner = Insertable<FurnitureOwnerTable>;

/** Shape for updating an existing `furniture_owner` row. All columns are optional. */
export type FurnitureOwnerUpdate = Updateable<FurnitureOwnerTable>;
