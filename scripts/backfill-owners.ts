/**
 * PlayFab → DB ownership backfill.
 *
 * For each resolved player, reads their `RoomDesign_*` keys, extracts the
 * furniture ID from `OriginUrl`, cross-references the local `furniture` table,
 * and optionally backfills missing `furniture_owner` rows.
 *
 * Two ways to supply players:
 *
 *   --token  <session-ticket>    Resolve one player from their session ticket.
 *                                Can be repeated: --token A --token B
 *
 *   --player-ids <id,id,...>     Comma-separated PlayFab IDs (from Game Manager
 *                                Players page or your own logs).
 *
 *   (both flags can be combined)
 *
 * Add --apply to backfill missing furniture_owner rows.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/backfill-owners.ts --token "1037F3..."
 *   pnpm tsx --env-file=.env scripts/backfill-owners.ts --player-ids "ABC123,DEF456"
 *   pnpm tsx --env-file=.env scripts/backfill-owners.ts --token "1037F3..." --apply
 */

import { PlayFabAdmin, PlayFabServer } from "playfab-sdk";
import { initDatabase, db } from "../src/config/db";
import { ENV } from "../src/config/env";

PlayFabServer.settings.titleId = ENV.PLAYFAB_TITLE_ID;
PlayFabServer.settings.developerSecretKey = ENV.PLAYFAB_DEVELOPER_SECRET_KEY;
PlayFabAdmin.settings.titleId = ENV.PLAYFAB_TITLE_ID;
PlayFabAdmin.settings.developerSecretKey = ENV.PLAYFAB_DEVELOPER_SECRET_KEY;

// ---------- CLI args ----------

const args = process.argv.slice(2);
const apply = args.includes("--apply");

function collectFlag(flag: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) results.push(args[i + 1]);
  }
  return results;
}

function flagValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const tokens = collectFlag("--token");
const playerIdRaw = flagValue("--player-ids");
const explicitPlayerIds = playerIdRaw
  ? playerIdRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

if (tokens.length === 0 && explicitPlayerIds.length === 0) {
  console.error(
    "Provide at least one of:\n" +
      "  --token <session-ticket>    (can repeat)\n" +
      "  --player-ids <id,id,...>\n\n" +
      "Example:\n" +
      '  pnpm backfill-owners --token "1037F3..."\n' +
      '  pnpm backfill-owners --player-ids "ABC123,DEF456"'
  );
  process.exit(1);
}

// ---------- PlayFab helpers ----------

function resolveSessionTicket(sessionTicket: string): Promise<string> {
  return new Promise((resolve, reject) => {
    PlayFabServer.AuthenticateSessionTicket(
      { SessionTicket: sessionTicket },
      (err, res) => {
        if (err) {
          reject(new Error(err.errorMessage ?? String(err)));
          return;
        }
        if (res.data.IsSessionTicketExpired) {
          reject(new Error("Session ticket is expired"));
          return;
        }
        const id = res.data.UserInfo?.PlayFabId;
        if (!id) reject(new Error("No PlayFabId in response"));
        else resolve(id);
      }
    );
  });
}

function getUserData(playfabId: string): Promise<PlayFabAdminModels.GetUserDataResult> {
  return new Promise((resolve, reject) => {
    PlayFabAdmin.GetUserData({ PlayFabId: playfabId }, (err, res) => {
      if (err) reject(new Error(err.errorMessage ?? String(err)));
      else resolve(res.data);
    });
  });
}

// ---------- Helpers ----------

type ParseResult =
  | { kind: "id"; id: number }
  | { kind: "no-origin-url" }   // prefab-only room, no server furniture
  | { kind: "invalid-id" }       // OriginUrl present but not a valid integer
  | { kind: "parse-error" };     // JSON could not be parsed at all

function parseRoomDesignValue(raw: string): ParseResult {
  // Values are prefixed with "ODIN|" in older Unity serialization
  const json = raw.startsWith("ODIN|") ? raw.slice(5) : raw;
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { kind: "parse-error" };
  }
  const originUrl = parsed?.OriginUrl ?? parsed?.originUrl;
  if (originUrl == null) return { kind: "no-origin-url" };
  const n = Number(originUrl);
  if (!Number.isFinite(n) || n <= 0) return { kind: "invalid-id" };
  return { kind: "id", id: n };
}

// ---------- Main ----------

async function main() {
  initDatabase();

  console.log(`mode: ${apply ? "APPLY (backfilling furniture_owner rows)" : "dry-run"}`);

  // 1. Resolve session tokens → player IDs.
  const playerIds = new Set<string>(explicitPlayerIds);

  for (const token of tokens) {
    try {
      const id = await resolveSessionTicket(token);
      playerIds.add(id);
      console.log(`token resolved → player: ${id}`);
    } catch (err) {
      console.error(`WARN: could not resolve token (${String(token).slice(0, 20)}...): ${err}`);
    }
  }

  if (playerIds.size === 0) {
    console.error("No players could be resolved. Aborting.");
    process.exit(1);
  }

  console.log(`\nPlayers to check: ${[...playerIds].join(", ")}\n`);

  // 2. Load local DB state.
  const dbRows = await db.selectFrom("furniture").select(["id"]).execute();
  const dbFurnitureIds = new Set(dbRows.map((r) => r.id));

  const existingOwners = await db
    .selectFrom("furniture_owner")
    .select(["furniture_id", "owner_id"])
    .execute();
  const ownerSet = new Set(existingOwners.map((r) => `${r.furniture_id}:${r.owner_id}`));

  // 3. Fetch RoomDesign_* keys for each player.
  type Match = { furnitureId: number; playerId: string; keyName: string };
  const matches: Match[] = [];
  const zombies: { playerId: string; keyName: string; furnitureId: number }[] = [];
  const prefabOnly: { playerId: string; keyName: string }[] = [];
  const missing: Match[] = [];

  for (const playerId of playerIds) {
    let data: PlayFabAdminModels.GetUserDataResult;
    try {
      data = await getUserData(playerId);
    } catch (err) {
      console.error(`WARN: could not fetch data for player ${playerId}: ${err}`);
      continue;
    }

    const keys = Object.entries(data.Data ?? {}).filter(([k]) =>
      k.startsWith("RoomDesign_")
    );

    if (keys.length === 0) {
      console.log(`  ${playerId}: no RoomDesign_* keys found`);
      continue;
    }

    for (const [key, record] of keys) {
      const result = parseRoomDesignValue(record.Value ?? "");
      if (result.kind === "no-origin-url") {
        prefabOnly.push({ playerId, keyName: key });
        continue;
      }
      if (result.kind !== "id" || !dbFurnitureIds.has(result.id)) {
        if (result.kind === "id") zombies.push({ playerId, keyName: key, furnitureId: result.id });
        continue;
      }
      matches.push({ furnitureId: result.id, playerId, keyName: key });
      if (!ownerSet.has(`${result.id}:${playerId}`)) {
        missing.push({ furnitureId: result.id, playerId, keyName: key });
      }
    }
  }

  // 4. Report.
  console.log("--- Matches (PlayFab key → local furniture) ---");
  if (matches.length === 0) {
    console.log("  (none)");
  } else {
    for (const m of matches) {
      const gap = ownerSet.has(`${m.furnitureId}:${m.playerId}`) ? "" : "  ← NO owner row";
      console.log(`  player=${m.playerId}  furniture_id=${m.furnitureId}  key=${m.keyName}${gap}`);
    }
  }

  console.log("\n--- Prefab-only rooms (no server furniture, nothing to reconcile) ---");
  if (prefabOnly.length === 0) {
    console.log("  (none)");
  } else {
    for (const p of prefabOnly) {
      console.log(`  player=${p.playerId}  key=${p.keyName}`);
    }
  }

  console.log("\n--- Zombie PlayFab keys (furniture ID not in local DB) ---");
  if (zombies.length === 0) {
    console.log("  (none)");
  } else {
    for (const z of zombies) {
      console.log(`  player=${z.playerId}  key=${z.keyName}  furniture_id=${z.furnitureId}`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`  Total RoomDesign_* keys:                     ${matches.length + zombies.length + prefabOnly.length}`);
  console.log(`  Prefab-only rooms (no server ref):           ${prefabOnly.length}`);
  console.log(`  Matched to local DB furniture:               ${matches.length}`);
  console.log(`  Missing furniture_owner rows:                ${missing.length}`);
  console.log(`  Zombie keys (furniture not in local DB):     ${zombies.length}`);

  // 5. Optionally backfill.
  if (apply && missing.length > 0) {
    console.log("\nBackfilling furniture_owner rows...");
    let inserted = 0;
    for (const m of missing) {
      try {
        await db
          .insertInto("furniture_owner")
          .values({ furniture_id: m.furnitureId, owner_id: m.playerId })
          .execute();
        console.log(`  inserted furniture_id=${m.furnitureId} owner_id=${m.playerId}`);
        inserted++;
      } catch (err) {
        console.error(`  WARN: skip ${m.furnitureId}:${m.playerId}: ${err}`);
      }
    }
    console.log(`Done — inserted ${inserted} row(s).`);
  } else if (missing.length > 0) {
    console.log("\nRun with --apply to insert the missing furniture_owner rows.");
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
