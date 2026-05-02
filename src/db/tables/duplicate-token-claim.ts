/**
 * Append-only audit log of duplicate-token claims.
 *
 * `duplicate_token` keeps `consumed_by` / `consumed_at` for backward
 * compatibility, but those columns only ever reflect the *most recent* claim.
 * Because tokens are reusable (intentionally, per `duplicate-token.ts`),
 * earlier claims would otherwise be silently lost. Every successful claim
 * appends a row here so the full claim history can be reconstructed.
 *
 * Rows are written by `consumeDuplicateToken` inside the same transaction
 * as the cloned furniture insert, so a row in this table implies the clone
 * was committed (and vice versa).
 *
 * `token_id` cascades on token delete; `furniture_id` is nullable + ON DELETE
 * SET NULL so deleting the cloned furniture (or its source, which cascades
 * the token away) does not destroy the audit record itself.
 */

import { Generated, ColumnType } from "kysely";

/**
 * Raw Kysely table interface for `duplicate_token_claim`.
 */
export interface DuplicateTokenClaimTable {
  /** Auto-incrementing primary key. */
  id: Generated<number>;
  /**
   * Foreign key referencing `duplicate_token.id ON DELETE CASCADE`. Deleting
   * the parent token (e.g. via furniture cascade) removes its audit rows.
   */
  token_id: number;
  /** PlayFab ID of the user who claimed the token in this event. */
  claimed_by: string;
  /** Unix timestamp (ms) of the claim. */
  claimed_at: number;
  /**
   * Foreign key referencing `furniture.id ON DELETE SET NULL` — the cloned
   * row produced by this claim. Nullable so the audit row survives if the
   * cloned furniture is later deleted by its new owner.
   */
  furniture_id: ColumnType<number | null, number | null, number | null>;
}
