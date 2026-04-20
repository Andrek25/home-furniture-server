/**
 * CRUD operations for duplicate tokens.
 *
 * A duplicate token is a shareable string an owner generates for one of their
 * furniture items. Any authenticated user who presents a valid token can claim
 * a copy of that furniture via `saveFurnitureFromExisting`.
 *
 * ## Token lifecycle
 *
 * ```
 * Owner calls GET /api/v1/duplicate-furniture/:id
 *   → createDuplicateToken()  — token row inserted, token string returned to owner
 *
 * Claimer calls POST /api/v1/duplicate-furniture/:token
 *   → getDuplicateToken()     — validates the token exists
 *   → (furniture is cloned)
 *   → consumeDuplicateToken() — records who claimed it and when
 * ```
 *
 * Tokens are **persistent and reusable** — `consumeDuplicateToken` writes
 * audit fields (`consumed_by`, `consumed_at`) but does NOT delete the row.
 * The same token can be claimed by multiple users. `deleteDuplicateToken` is
 * available for explicit removal (e.g. when a furniture is deleted, its tokens
 * are cleaned up by `deleteFurnitureById` via FK cascade).
 */

import { db } from "../config/db";
import crypto from "node:crypto";

/**
 * Creates a new duplicate token for a furniture item and persists it.
 *
 * The token is 24 random bytes encoded as a 48-character hex string, making
 * it unpredictable and safe to share as a URL parameter.
 *
 * @param furnitureId - Primary key of the furniture being shared.
 * @param ownerId - PlayFab ID of the user generating the token (must own the furniture).
 * @param expires - Unix timestamp (ms) after which the token should be considered
 *   expired. Note: expiry is stored for auditing but is not enforced by this
 *   service — callers are responsible for checking it if needed.
 * @returns The generated token string (48-char hex).
 */
export async function createDuplicateToken(furnitureId: number, ownerId: string, expires: number): Promise<string> {
  // 24 bytes → 48 hex characters; cryptographically random so it cannot be guessed.
  const token = crypto.randomBytes(24).toString("hex");
  await db.insertInto("duplicate_token")
    .values({ token, furniture_id: furnitureId, owner_id: ownerId, expires })
    .execute();
  return token;
}

/**
 * Fetches a duplicate token row by its token string.
 *
 * @param token - The 48-char hex token to look up.
 * @returns The full token row, or `undefined` if the token does not exist.
 */
export async function getDuplicateToken(token: string) {
  return await db.selectFrom("duplicate_token")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();
}

/**
 * Records a claim against a token by writing the claimer's ID and the claim
 * timestamp. The token row is kept intact and remains usable for future claims.
 *
 * @param token - The token string being consumed.
 * @param consumedBy - PlayFab ID of the user claiming the duplicate.
 * @param consumedAt - Unix timestamp (ms) of the claim.
 */
export async function consumeDuplicateToken(token: string, consumedBy: string, consumedAt: number) {
  await db.updateTable("duplicate_token")
    .set({ consumed_by: consumedBy, consumed_at: consumedAt })
    .where("token", "=", token)
    .execute();
}

/**
 * Permanently removes a token row from the database.
 *
 * Not called during normal claim flow (tokens survive claims). Used by
 * `deleteFurnitureById` — though in practice the FK `ON DELETE CASCADE`
 * handles removal automatically when the parent furniture is deleted.
 *
 * @param token - The token string to delete.
 */
export async function deleteDuplicateToken(token: string) {
  await db.deleteFrom("duplicate_token")
    .where("token", "=", token)
    .execute();
}
