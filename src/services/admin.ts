import { PlayFabAdmin, PlayFabServer } from "playfab-sdk";
import { db } from "../config/db";
import { ENV } from "../config/env";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "../config/path";
import { removeThumbnailURL } from "../utils/thumbnails";
import { saveFurnitureFromExisting } from "./furniture";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import zlib from "node:zlib";

PlayFabServer.settings.titleId = ENV.PLAYFAB_TITLE_ID;
PlayFabServer.settings.developerSecretKey = ENV.PLAYFAB_DEVELOPER_SECRET_KEY;
PlayFabAdmin.settings.titleId = ENV.PLAYFAB_TITLE_ID;
PlayFabAdmin.settings.developerSecretKey = ENV.PLAYFAB_DEVELOPER_SECRET_KEY;

// ---------- DB queries ----------

export async function getAllFurnitureWithOwners() {
  const rows = await db
    .selectFrom("furniture as f")
    .leftJoin("furniture_owner as o", "o.furniture_id", "f.id")
    .select([
      "f.id",
      "f.file_name",
      "f.local_name",
      "f.thumbnail",
      "f.created_at",
      "o.owner_id",
    ])
    .orderBy("f.id", "asc")
    .execute();

  // Group owners per furniture row
  const map = new Map<
    number,
    { id: number; file_name: string; local_name: string; thumbnail: string | null; created_at: string; owners: string[] }
  >();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        file_name: row.file_name,
        local_name: row.local_name,
        thumbnail: row.thumbnail ?? null,
        created_at: String(row.created_at),
        owners: [],
      });
    }
    if (row.owner_id) map.get(row.id)!.owners.push(row.owner_id);
  }
  return [...map.values()];
}

export async function getOrphanedFurniture() {
  return db
    .selectFrom("furniture as f")
    .leftJoin("furniture_owner as o", "o.furniture_id", "f.id")
    .select(["f.id", "f.file_name", "f.local_name", "f.thumbnail", "f.created_at"])
    .where("o.furniture_id", "is", null)
    .orderBy("f.id", "asc")
    .execute();
}

// ---------- PlayFab helpers ----------

function resolveSessionTicket(ticket: string): Promise<string> {
  return new Promise((resolve, reject) => {
    PlayFabServer.AuthenticateSessionTicket({ SessionTicket: ticket }, (err, res) => {
      if (err) { reject(new Error(err.errorMessage ?? String(err))); return; }
      if (res.data.IsSessionTicketExpired) { reject(new Error("Session ticket expired")); return; }
      const id = res.data.UserInfo?.PlayFabId;
      if (!id) reject(new Error("No PlayFabId in response"));
      else resolve(id);
    });
  });
}

function fetchUserData(playfabId: string): Promise<PlayFabAdminModels.GetUserDataResult> {
  return new Promise((resolve, reject) => {
    PlayFabAdmin.GetUserData({ PlayFabId: playfabId }, (err, res) => {
      if (err) reject(new Error(err.errorMessage ?? String(err)));
      else resolve(res.data);
    });
  });
}

type ParseResult =
  | { kind: "id"; id: number }
  | { kind: "no-origin-url" }
  | { kind: "invalid-id" }
  | { kind: "parse-error" };

function parseRoomDesignValue(raw: string): ParseResult {
  const json = raw.startsWith("ODIN|") ? raw.slice(5) : raw;
  let parsed: any;
  try { parsed = JSON.parse(json); } catch { return { kind: "parse-error" }; }
  const originUrl = parsed?.OriginUrl ?? parsed?.originUrl;
  if (originUrl == null) return { kind: "no-origin-url" };
  const n = Number(originUrl);
  if (!Number.isFinite(n) || n <= 0) return { kind: "invalid-id" };
  return { kind: "id", id: n };
}

// ---------- All-players export ----------

function getAllSegments(): Promise<PlayFabAdminModels.GetAllSegmentsResult> {
  return new Promise((resolve, reject) => {
    PlayFabAdmin.GetAllSegments({}, (err, res) => {
      if (err) reject(new Error(err.errorMessage ?? String(err)));
      else resolve(res.data);
    });
  });
}

function startExport(segmentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    PlayFabAdmin.ExportPlayersInSegment({ SegmentId: segmentId }, (err, res) => {
      if (err) reject(new Error(err.errorMessage ?? String(err)));
      else resolve(res.data.ExportId!);
    });
  });
}

function pollExport(exportId: string, maxWaitMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      PlayFabAdmin.GetSegmentExport({ ExportId: exportId }, (err, res) => {
        if (err) { reject(new Error(err.errorMessage ?? String(err))); return; }
        const { State, IndexUrl } = res.data;
        if (State === "Complete" && IndexUrl) { resolve(IndexUrl); return; }
        if (State === "Failed") { reject(new Error("PlayFab export failed")); return; }
        if (Date.now() - started > maxWaitMs) { reject(new Error("Export timed out")); return; }
        setTimeout(check, 3_000);
      });
    };
    check();
  });
}

function downloadText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      const stream =
        res.headers["content-encoding"] === "gzip"
          ? res.pipe(zlib.createGunzip())
          : res;
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    }).on("error", reject);
  });
}

function parsePlayerIdsFromCsv(csv: string): string[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const col = headers.findIndex((h) => h === "PlayerId" || h === "playerid" || h === "Player Id");
  if (col === -1) return [];
  return lines
    .slice(1)
    .map((line) => line.split(",")[col]?.trim().replace(/^"|"$/g, ""))
    .filter((id): id is string => Boolean(id));
}

export async function getAllPlayerIds(): Promise<string[]> {
  const { Segments } = await getAllSegments();
  const allPlayers = Segments?.find((s) => s.Name === "All Players");
  if (!allPlayers?.Id) throw new Error('Could not find "All Players" segment in PlayFab');

  const exportId = await startExport(allPlayers.Id);
  const indexUrl = await pollExport(exportId);

  // Index file: one chunk URL per line
  const indexText = await downloadText(indexUrl);
  const chunkUrls = indexText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const ids: string[] = [];
  for (const chunkUrl of chunkUrls) {
    const csv = await downloadText(chunkUrl);
    ids.push(...parsePlayerIdsFromCsv(csv));
  }
  return [...new Set(ids)];
}

// ---------- Backfill ----------

export interface BackfillOptions {
  tokens?: string[];
  playerIds?: string[];
  all?: boolean;
  apply?: boolean;
}

export interface BackfillResult {
  totalPlayersScanned: number;
  resolvedPlayers: { token: string; playerId: string }[];
  failedTokens: { token: string; error: string }[];
  matches: { furnitureId: number; playerId: string; keyName: string; alreadyOwned: boolean }[];
  zombies: { furnitureId: number; playerId: string; keyName: string }[];
  prefabOnly: number;
  inserted: number;
}

export async function backfillOwners(opts: BackfillOptions): Promise<BackfillResult> {
  const result: BackfillResult = {
    totalPlayersScanned: 0,
    resolvedPlayers: [],
    failedTokens: [],
    matches: [],
    zombies: [],
    prefabOnly: 0,
    inserted: 0,
  };

  // Resolve tokens → player IDs
  const playerIds = new Set<string>(opts.playerIds ?? []);
  for (const token of opts.tokens ?? []) {
    try {
      const id = await resolveSessionTicket(token);
      playerIds.add(id);
      result.resolvedPlayers.push({ token, playerId: id });
    } catch (err) {
      result.failedTokens.push({ token, error: String(err) });
    }
  }

  // Pull all players from PlayFab if requested
  if (opts.all) {
    const allIds = await getAllPlayerIds();
    for (const id of allIds) playerIds.add(id);
  }

  if (playerIds.size === 0) return result;
  result.totalPlayersScanned = playerIds.size;

  // Load DB state
  const dbRows = await db.selectFrom("furniture").select(["id"]).execute();
  const dbIds = new Set(dbRows.map((r) => r.id));

  const existing = await db
    .selectFrom("furniture_owner")
    .select(["furniture_id", "owner_id"])
    .execute();
  const ownerSet = new Set(existing.map((r) => `${r.furniture_id}:${r.owner_id}`));

  // Fetch PlayFab data per player
  for (const playerId of playerIds) {
    let data: PlayFabAdminModels.GetUserDataResult;
    try { data = await fetchUserData(playerId); }
    catch { continue; }

    for (const [key, record] of Object.entries(data.Data ?? {})) {
      if (!key.startsWith("RoomDesign_")) continue;
      const parsed = parseRoomDesignValue(record.Value ?? "");

      if (parsed.kind === "no-origin-url" || parsed.kind === "parse-error") {
        result.prefabOnly++;
        continue;
      }
      if (parsed.kind !== "id" || !dbIds.has(parsed.id)) {
        if (parsed.kind === "id") result.zombies.push({ furnitureId: parsed.id, playerId, keyName: key });
        continue;
      }

      const alreadyOwned = ownerSet.has(`${parsed.id}:${playerId}`);
      result.matches.push({ furnitureId: parsed.id, playerId, keyName: key, alreadyOwned });

      if (opts.apply && !alreadyOwned) {
        try {
          await db
            .insertInto("furniture_owner")
            .values({ furniture_id: parsed.id, owner_id: playerId })
            .execute();
          ownerSet.add(`${parsed.id}:${playerId}`);
          result.inserted++;
        } catch { /* unique constraint race — already inserted */ }
      }
    }
  }

  return result;
}

// ---------- PlayFab dedupe (one furniture row per RoomDesign key) ----------

interface RoomRef {
  playerId: string;
  keyName: string;
  rawValue: string;
}

function rewriteRoomDesignOriginUrl(rawValue: string, newOriginUrl: number): string {
  const isOdin = rawValue.startsWith("ODIN|");
  const json = isOdin ? rawValue.slice(5) : rawValue;
  const parsed = JSON.parse(json);
  // Preserve whichever casing the source used; preserve original numeric/string type.
  const key = "OriginUrl" in parsed ? "OriginUrl" : "originUrl" in parsed ? "originUrl" : "OriginUrl";
  const wasNumeric = typeof parsed[key] === "number";
  parsed[key] = wasNumeric ? newOriginUrl : String(newOriginUrl);
  return (isOdin ? "ODIN|" : "") + JSON.stringify(parsed);
}

function updateUserDataKey(playfabId: string, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    PlayFabAdmin.UpdateUserData(
      { PlayFabId: playfabId, Data: { [key]: value } },
      (err) => {
        if (err) reject(new Error(err.errorMessage ?? String(err)));
        else resolve();
      }
    );
  });
}

export interface DedupeGroup {
  furnitureId: number;
  winner: { playerId: string; keyName: string };
  losers: { playerId: string; keyName: string; newFurnitureId?: number; error?: string }[];
}

export interface DedupeResult {
  totalPlayersScanned: number;
  totalDuplicateGroups: number;
  totalDuplicateRefs: number;
  newRowsCreated: number;
  playfabKeysRewritten: number;
  groups: DedupeGroup[];
}

export async function dedupePlayfabReferences(opts: { apply?: boolean } = {}): Promise<DedupeResult> {
  const playerIds = await getAllPlayerIds();

  // furnitureId -> all references to it across all players
  const refsByFurnitureId = new Map<number, RoomRef[]>();

  for (const playerId of playerIds) {
    let data: PlayFabAdminModels.GetUserDataResult;
    try { data = await fetchUserData(playerId); }
    catch { continue; }

    for (const [key, record] of Object.entries(data.Data ?? {})) {
      if (!key.startsWith("RoomDesign_")) continue;
      const rawValue = record.Value ?? "";
      const parsed = parseRoomDesignValue(rawValue);
      if (parsed.kind !== "id") continue;

      const list = refsByFurnitureId.get(parsed.id) ?? [];
      list.push({ playerId, keyName: key, rawValue });
      refsByFurnitureId.set(parsed.id, list);
    }
  }

  // Filter to furniture IDs referenced by 2+ keys
  const duplicateEntries = [...refsByFurnitureId.entries()].filter(([, refs]) => refs.length > 1);

  const result: DedupeResult = {
    totalPlayersScanned: playerIds.length,
    totalDuplicateGroups: duplicateEntries.length,
    totalDuplicateRefs: duplicateEntries.reduce((sum, [, refs]) => sum + refs.length - 1, 0),
    newRowsCreated: 0,
    playfabKeysRewritten: 0,
    groups: [],
  };

  for (const [furnitureId, refs] of duplicateEntries) {
    const [winner, ...losers] = refs;
    const group: DedupeGroup = {
      furnitureId,
      winner: { playerId: winner.playerId, keyName: winner.keyName },
      losers: losers.map((l) => ({ playerId: l.playerId, keyName: l.keyName })),
    };
    result.groups.push(group);

    if (!opts.apply) continue;

    // Load source row once per group — needed by saveFurnitureFromExisting.
    const source = await db
      .selectFrom("furniture")
      .selectAll()
      .where("id", "=", furnitureId)
      .executeTakeFirst();

    if (!source) {
      // Source row vanished between scan and apply — every loser is now a zombie
      // reference. Skip; backfill/zombies endpoint will surface it.
      for (const slot of group.losers) slot.error = "source-furniture-missing";
      continue;
    }

    for (let i = 0; i < losers.length; i++) {
      const loser = losers[i];
      const slot = group.losers[i];
      try {
        const created = await saveFurnitureFromExisting(loser.playerId, source);
        slot.newFurnitureId = created.id;
        result.newRowsCreated++;

        const newValue = rewriteRoomDesignOriginUrl(loser.rawValue, created.id);
        await updateUserDataKey(loser.playerId, loser.keyName, newValue);
        result.playfabKeysRewritten++;
      } catch (err) {
        slot.error = err instanceof Error ? err.message : String(err);
        // Don't roll back the new furniture row on PlayFab failure: the row is
        // valid, the player owns it, only the PlayFab key still points at the
        // old ID. Re-running dedupe will pick the same dup up and try again.
      }
    }
  }

  return result;
}

// ---------- Zombies (PlayFab-vs-DB drift) ----------

export interface ZombiesResult {
  totalPlayersScanned: number;
  zombies: { furnitureId: number; playerId: string; keyName: string }[];
  zombieCount: number;
  uniqueZombieIds: number;
}

export async function getZombies(opts: { playerIds?: string[]; all?: boolean } = {}): Promise<ZombiesResult> {
  const result = await backfillOwners({
    playerIds: opts.playerIds,
    all: opts.all ?? !opts.playerIds?.length,
    apply: false,
  });
  return {
    totalPlayersScanned: result.totalPlayersScanned,
    zombies: result.zombies,
    zombieCount: result.zombies.length,
    uniqueZombieIds: new Set(result.zombies.map((z) => z.furnitureId)).size,
  };
}

// ---------- Stats ----------

function dirSize(dir: string): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const stat = fs.statSync(path.join(dir, name));
      if (stat.isFile()) { count++; bytes += stat.size; }
    }
  } catch { /* dir may not exist yet */ }
  return { count, bytes };
}

export async function getStats() {
  const [
    totalFurniture,
    totalOwnerships,
    orphanedFurniture,
    uncommittedFurniture,
    duplicateTokens,
    duplicateClaims,
  ] = await Promise.all([
    db.selectFrom("furniture").select(db.fn.count<number>("id").as("c")).executeTakeFirstOrThrow(),
    db.selectFrom("furniture_owner").select(db.fn.count<number>("id").as("c")).executeTakeFirstOrThrow(),
    db.selectFrom("furniture as f")
      .leftJoin("furniture_owner as o", "o.furniture_id", "f.id")
      .select(db.fn.count<number>("f.id").as("c"))
      .where("o.furniture_id", "is", null)
      .executeTakeFirstOrThrow(),
    db.selectFrom("furniture").select(db.fn.count<number>("id").as("c"))
      .where("committed", "=", 0)
      .executeTakeFirstOrThrow(),
    db.selectFrom("duplicate_token").select(db.fn.count<number>("id").as("c")).executeTakeFirstOrThrow(),
    db.selectFrom("duplicate_token_claim").select(db.fn.count<number>("id").as("c")).executeTakeFirstOrThrow(),
  ]);

  const furnitureDir = dirSize(FURNITURE_PATH);
  const thumbnailDir = dirSize(THUMBNAIL_PATH);

  return {
    furniture: {
      total: Number(totalFurniture.c),
      orphaned: Number(orphanedFurniture.c),
      uncommitted: Number(uncommittedFurniture.c),
    },
    ownerships: Number(totalOwnerships.c),
    duplicateTokens: {
      total: Number(duplicateTokens.c),
      totalClaims: Number(duplicateClaims.c),
    },
    disk: {
      furnitureFiles: furnitureDir.count,
      furnitureBytes: furnitureDir.bytes,
      thumbnailFiles: thumbnailDir.count,
      thumbnailBytes: thumbnailDir.bytes,
      totalBytes: furnitureDir.bytes + thumbnailDir.bytes,
    },
  };
}

// ---------- Uncommitted ----------

export async function getUncommittedFurniture() {
  return db
    .selectFrom("furniture as f")
    .leftJoin("furniture_owner as o", "o.furniture_id", "f.id")
    .select([
      "f.id",
      "f.file_name",
      "f.local_name",
      "f.thumbnail",
      "f.created_at",
      "o.owner_id",
    ])
    .where("f.committed", "=", 0)
    .orderBy("f.created_at", "asc")
    .execute();
}

// ---------- Player furniture ----------

export async function getPlayerFurniture(playfabId: string) {
  return db
    .selectFrom("furniture as f")
    .innerJoin("furniture_owner as o", "o.furniture_id", "f.id")
    .select([
      "f.id",
      "f.file_name",
      "f.local_name",
      "f.thumbnail",
      "f.committed",
      "f.created_at",
      "o.created_at as owned_since",
    ])
    .where("o.owner_id", "=", playfabId)
    .orderBy("f.id", "asc")
    .execute();
}

// ---------- Manual ownership ----------

export async function assignFurnitureOwner(furnitureId: number, playfabId: string) {
  const exists = await db
    .selectFrom("furniture")
    .select("id")
    .where("id", "=", furnitureId)
    .executeTakeFirst();
  if (!exists) return { ok: false, reason: "furniture-not-found" as const };

  try {
    await db
      .insertInto("furniture_owner")
      .values({ furniture_id: furnitureId, owner_id: playfabId })
      .execute();
    return { ok: true, alreadyExisted: false };
  } catch (err) {
    // Unique (furniture_id, owner_id) → already owns it. Idempotent success.
    const already = await db
      .selectFrom("furniture_owner")
      .select("id")
      .where("furniture_id", "=", furnitureId)
      .where("owner_id", "=", playfabId)
      .executeTakeFirst();
    if (already) return { ok: true, alreadyExisted: true };
    throw err;
  }
}

export async function removeFurnitureOwner(furnitureId: number, playfabId: string) {
  const result = await db
    .deleteFrom("furniture_owner")
    .where("furniture_id", "=", furnitureId)
    .where("owner_id", "=", playfabId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

// ---------- Duplicate tokens ----------

export async function listDuplicateTokens() {
  const rows = await db
    .selectFrom("duplicate_token as t")
    .leftJoin("furniture as f", "f.id", "t.furniture_id")
    .leftJoin("duplicate_token_claim as c", "c.token_id", "t.id")
    .select([
      "t.id",
      "t.token",
      "t.furniture_id",
      "t.owner_id",
      "t.expires",
      "t.consumed_by",
      "t.consumed_at",
      "f.file_name",
      db.fn.count<number>("c.id").as("claim_count"),
    ])
    .groupBy([
      "t.id",
      "t.token",
      "t.furniture_id",
      "t.owner_id",
      "t.expires",
      "t.consumed_by",
      "t.consumed_at",
      "f.file_name",
    ])
    .orderBy("t.id", "desc")
    .execute();
  return rows.map((r) => ({
    ...r,
    claim_count: Number(r.claim_count),
    furniture_exists: r.file_name != null,
  }));
}

// ---------- Reconcile ----------

function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
}

export interface ReconcileResult {
  furnitureRows: number;
  diskZipFiles: number;
  diskThumbFiles: number;
  orphanZips: string[];           // disk − db
  orphanThumbs: string[];         // disk − db
  zombieZipRows: { id: number; local_name: string }[];     // db − disk
  zombieThumbRows: { id: number; thumbnail: string }[];    // db − disk
  deletedOrphanFiles: number;
}

export async function reconcileDiskAndDb(opts: { apply?: boolean } = {}): Promise<ReconcileResult> {
  const furnitureRows = await db
    .selectFrom("furniture")
    .select(["id", "local_name", "thumbnail"])
    .execute();

  const expectedZips = new Set(furnitureRows.map((r) => r.local_name));
  const expectedThumbs = new Set(
    furnitureRows
      .map((r) => r.thumbnail)
      .filter((t): t is string => typeof t === "string")
      .map(removeThumbnailURL)
  );

  const diskZips = listFiles(FURNITURE_PATH);
  const diskThumbs = listFiles(THUMBNAIL_PATH);
  const diskZipSet = new Set(diskZips);
  const diskThumbSet = new Set(diskThumbs);

  const orphanZips = diskZips.filter((f) => !expectedZips.has(f));
  const orphanThumbs = diskThumbs.filter((f) => !expectedThumbs.has(f));

  const zombieZipRows = furnitureRows
    .filter((r) => !diskZipSet.has(r.local_name))
    .map((r) => ({ id: r.id, local_name: r.local_name }));

  const zombieThumbRows = furnitureRows
    .filter((r) => r.thumbnail && !diskThumbSet.has(removeThumbnailURL(r.thumbnail)))
    .map((r) => ({ id: r.id, thumbnail: r.thumbnail! }));

  let deletedOrphanFiles = 0;
  if (opts.apply) {
    for (const f of orphanZips) {
      fs.rmSync(path.join(FURNITURE_PATH, f), { force: true });
      deletedOrphanFiles++;
    }
    for (const f of orphanThumbs) {
      fs.rmSync(path.join(THUMBNAIL_PATH, f), { force: true });
      deletedOrphanFiles++;
    }
  }

  return {
    furnitureRows: furnitureRows.length,
    diskZipFiles: diskZips.length,
    diskThumbFiles: diskThumbs.length,
    orphanZips,
    orphanThumbs,
    zombieZipRows,
    zombieThumbRows,
    deletedOrphanFiles,
  };
}
