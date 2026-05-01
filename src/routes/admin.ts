import { Router } from "express";
import { adminMiddleware } from "../middlewares/admin";
import {
  getAllFurnitureWithOwners,
  getOrphanedFurniture,
  backfillOwners,
  getStats,
  getUncommittedFurniture,
  getPlayerFurniture,
  assignFurnitureOwner,
  removeFurnitureOwner,
  listDuplicateTokens,
  reconcileDiskAndDb,
} from "../services/admin";
import { deleteFurnitureById } from "../services/furniture";

export function AdminRoutes() {
  const router = Router();
  router.use(adminMiddleware);

  /**
   * GET /admin/furniture
   * All furniture rows, each with their owner PlayFab IDs.
   * owners: [] means orphaned.
   */
  router.get("/admin/furniture", async (_req, res) => {
    try {
      const furniture = await getAllFurnitureWithOwners();
      res.json({ total: furniture.length, furniture });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * GET /admin/furniture/orphaned
   * Furniture rows with no entry in furniture_owner.
   */
  router.get("/admin/furniture/orphaned", async (_req, res) => {
    try {
      const orphaned = await getOrphanedFurniture();
      res.json({ total: orphaned.length, furniture: orphaned });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * GET /admin/stats
   * Aggregate health snapshot: furniture counts (total / orphaned / uncommitted),
   * ownership count, duplicate token counts, on-disk file sizes.
   */
  router.get("/admin/stats", async (_req, res) => {
    try {
      const stats = await getStats();
      res.json(stats);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * GET /admin/uncommitted
   * Furniture rows with committed=0 (P6 pending uploads not yet finalized).
   */
  router.get("/admin/uncommitted", async (_req, res) => {
    try {
      const rows = await getUncommittedFurniture();
      res.json({ total: rows.length, furniture: rows });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * GET /admin/players/:playfabId
   * All furniture rows owned by a specific PlayFab user.
   */
  router.get("/admin/players/:playfabId", async (req, res) => {
    try {
      const rows = await getPlayerFurniture(req.params.playfabId);
      res.json({ playerId: req.params.playfabId, total: rows.length, furniture: rows });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * DELETE /admin/furniture/:id
   * Force-delete a furniture row regardless of owner. Use this to clean up
   * orphaned rows that the regular owner-gated DELETE cannot reach. Cleans
   * up the on-disk file (if no other row references it) and the thumbnail.
   */
  router.delete("/admin/furniture/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }
    try {
      const deleted = await deleteFurnitureById(id);
      if (!deleted) {
        res.status(404).json({ error: "furniture not found" });
        return;
      }
      res.json({ deleted });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * POST /admin/furniture/:id/assign-owner
   * Body: { playerId: string }
   * Manually assign a PlayFab user as an owner of a furniture row. Idempotent —
   * returns alreadyExisted=true if the row already exists.
   */
  router.post("/admin/furniture/:id/assign-owner", async (req, res) => {
    const id = Number(req.params.id);
    const { playerId } = (req.body ?? {}) as { playerId?: unknown };
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }
    if (typeof playerId !== "string" || !playerId) {
      res.status(400).json({ error: "playerId must be a non-empty string" });
      return;
    }
    try {
      const result = await assignFurnitureOwner(id, playerId);
      if (!result.ok) {
        res.status(404).json({ error: result.reason });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * DELETE /admin/furniture/:id/owner/:playerId
   * Remove a single owner from a furniture row. The furniture row itself is
   * left in place — useful when a user transferred away or you want to revoke
   * one access without deleting the asset. If this leaves the row with zero
   * owners, it becomes orphaned (visible in /admin/furniture/orphaned).
   */
  router.delete("/admin/furniture/:id/owner/:playerId", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }
    try {
      const removed = await removeFurnitureOwner(id, req.params.playerId);
      if (!removed) {
        res.status(404).json({ error: "owner row not found" });
        return;
      }
      res.json({ removed: true });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * GET /admin/duplicate-tokens
   * All duplicate tokens with claim count and the source furniture's file name.
   * `furniture_exists=false` means the source furniture was deleted but the
   * token row survived (which should not happen — FK cascade should clean up).
   */
  router.get("/admin/duplicate-tokens", async (_req, res) => {
    try {
      const tokens = await listDuplicateTokens();
      res.json({ total: tokens.length, tokens });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * GET /admin/reconcile
   * Disk ↔ DB drift report. Read-only.
   *
   * POST /admin/reconcile  body: { apply?: boolean }
   * Same report; with apply=true, deletes orphan files on disk. Zombie rows
   * (DB row whose file is missing on disk) are reported but never auto-fixed.
   */
  router.get("/admin/reconcile", async (_req, res) => {
    try {
      res.json(await reconcileDiskAndDb());
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  router.post("/admin/reconcile", async (req, res) => {
    const apply = (req.body as { apply?: unknown })?.apply === true;
    try {
      res.json(await reconcileDiskAndDb({ apply }));
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  /**
   * POST /admin/backfill
   * Cross-references PlayFab RoomDesign_* keys with the local furniture table
   * and optionally inserts missing furniture_owner rows.
   *
   * Body:
   *   {
   *     tokens?:    string[]   — PlayFab session tickets to resolve
   *     playerIds?: string[]   — PlayFab IDs (from Game Manager or logs)
   *     all?:       boolean    — true to pull every player via ExportPlayersInSegment
   *     apply?:     boolean    — true to insert missing owner rows (default false)
   *   }
   *
   * Response:
   *   {
   *     resolvedPlayers: { token, playerId }[]
   *     failedTokens:    { token, error }[]
   *     matches:         { furnitureId, playerId, keyName, alreadyOwned }[]
   *     zombies:         { furnitureId, playerId, keyName }[]
   *     prefabOnly:      { playerId, keyName }[]
   *     inserted:        number
   *   }
   */
  router.post("/admin/backfill", async (req, res) => {
    const { tokens, playerIds, all, apply } = req.body as {
      tokens?: unknown;
      playerIds?: unknown;
      all?: unknown;
      apply?: unknown;
    };

    if (tokens !== undefined && !Array.isArray(tokens)) {
      res.status(400).json({ error: "tokens must be an array of strings" });
      return;
    }
    if (playerIds !== undefined && !Array.isArray(playerIds)) {
      res.status(400).json({ error: "playerIds must be an array of strings" });
      return;
    }
    if (!tokens?.length && !playerIds?.length && all !== true) {
      res.status(400).json({ error: "provide tokens, playerIds, or all:true" });
      return;
    }

    try {
      const result = await backfillOwners({
        tokens: (tokens as string[] | undefined) ?? [],
        playerIds: (playerIds as string[] | undefined) ?? [],
        all: all === true,
        apply: apply === true,
      });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  return router;
}
