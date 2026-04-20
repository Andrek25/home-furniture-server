/**
 * Kysely table definition for the `duplicate_token` table.
 *
 * Each row represents a shareable token an owner generates to let other users
 * claim a copy of one of their furniture items. See `src/services/duplicate-token.ts`
 * for the full create → get → consume lifecycle.
 *
 * ## Persistence model
 * Tokens are **never deleted on claim**. After a successful claim,
 * `consumed_by` and `consumed_at` are written for auditing, but the row
 * remains in the table and the token string stays valid for future claims.
 * Rows are only removed when the parent furniture is deleted (FK cascade).
 *
 * ## Expiry
 * `expires` is a Unix timestamp (ms) set when the token is created. It is
 * stored for auditing purposes but is **not enforced** at claim time — the
 * claim endpoint does not reject expired tokens. Enforcement would need to be
 * added to `postDuplicateFurnitureController` if required.
 *
 * ## `ColumnType` usage
 * Kysely's `ColumnType<Select, Insert, Update>` lets the same interface
 * express different nullability rules depending on the operation:
 * - `consumed_by` / `consumed_at` — `null` on insert (not yet consumed) and
 *   update, but read back as `string` / `number` (Kysely does not model the
 *   post-consume non-null state in the select type).
 * - `expires` — optional on insert (defaults to a distant future if omitted)
 *   and update, always present on select.
 */

import { Generated, ColumnType } from 'kysely';

/**
 * Raw Kysely table interface for `duplicate_token`.
 * Consumed via `db.selectFrom("duplicate_token")` etc. in
 * `src/services/duplicate-token.ts`.
 */
export interface DuplicateTokenTable {
  /** Auto-incrementing primary key. */
  id: Generated<number>;
  /**
   * The 48-character hex token string shared with claimers. Unique across all
   * rows (`idx_duplicate_token_token` unique index).
   */
  token: string;
  /**
   * Foreign key referencing `furniture.id ON DELETE CASCADE`. Deleting the
   * furniture removes all of its tokens automatically.
   */
  furniture_id: number;
  /**
   * PlayFab ID of the user who generated this token (must own `furniture_id`
   * at the time the token was created).
   */
  owner_id: string;
  /**
   * Unix timestamp (ms) after which the token is considered expired.
   * Optional on insert; always present on select. Not actively enforced at
   * claim time — stored for auditing only.
   */
  expires: ColumnType<number, number | undefined, number | undefined>;
  /**
   * PlayFab ID of the user who most recently claimed this token, or `null`
   * if it has never been claimed. Written by `consumeDuplicateToken`.
   */
  consumed_by: ColumnType<string, string | null, string | null>;
  /**
   * Unix timestamp (ms) of the most recent claim, or `null` if unclaimed.
   * Written alongside `consumed_by` by `consumeDuplicateToken`.
   */
  consumed_at: ColumnType<number, number | null, number | null>;
}
