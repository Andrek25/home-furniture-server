/**
 * Sweeper for the P6 two-phase upload protocol. Deletes furniture rows that
 * were uploaded with `pending=true` but never committed (the second-phase
 * `POST /api/v1/furniture/:id/commit` call never arrived).
 *
 * A row is eligible iff:
 *   - `committed = 0`
 *   - `created_at` is older than --max-age-min (default 10 minutes)
 *
 * For each match the script calls `deleteFurnitureById` (no ownerId — sweeper
 * runs with admin context), which handles disk-file cleanup, shared-name
 * reference counting, thumbnail deletion, token cleanup, and audit-row
 * cascade in one place.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/sweep-uncommitted.ts
 *   pnpm tsx --env-file=.env scripts/sweep-uncommitted.ts --apply
 *   pnpm tsx --env-file=.env scripts/sweep-uncommitted.ts --apply --max-age-min=30
 *
 * Default mode is dry-run (reports candidates without deleting). Run with
 * --apply to actually remove rows + files. The --max-age-min flag controls
 * the cutoff; never set it below the realistic ceiling for an upload to
 * complete or you'll race legitimate in-flight commits.
 */

import { initDatabase, db } from "../src/config/db";
import { initPaths } from "../src/config/path";
import {
  deleteFurnitureById,
  findUncommittedFurnitureOlderThan,
} from "../src/services/furniture";

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const ageArg = process.argv.find((a) => a.startsWith("--max-age-min="));
  const maxAgeMin = ageArg ? Number(ageArg.split("=")[1]) : 10;
  if (Number.isNaN(maxAgeMin) || maxAgeMin <= 0) {
    throw new Error(`--max-age-min must be a positive number, got ${ageArg}`);
  }
  return { apply, maxAgeMin };
}

async function main() {
  initPaths();
  initDatabase();

  const { apply, maxAgeMin } = parseArgs();
  const ids = await findUncommittedFurnitureOlderThan(maxAgeMin);

  console.log(`mode: ${apply ? "APPLY" : "dry-run"}`);
  console.log(`cutoff: committed=0 AND created_at older than ${maxAgeMin} minute(s)`);
  console.log(`pending rows past cutoff: ${ids.length}`);

  if (ids.length === 0) {
    await db.destroy();
    return;
  }

  const rows = await db
    .selectFrom("furniture")
    .leftJoin("furniture_owner", "furniture_owner.furniture_id", "furniture.id")
    .select([
      "furniture.id",
      "furniture.local_name",
      "furniture.thumbnail",
      "furniture.created_at",
      "furniture_owner.owner_id",
    ])
    .where("furniture.id", "in", ids)
    .execute();
  for (const r of rows) {
    console.log(
      `  id=${r.id} local_name=${r.local_name} owner=${r.owner_id ?? "(none)"} created_at=${r.created_at}`
    );
  }

  if (!apply) {
    console.log("\nrun with --apply to delete the rows above.");
    await db.destroy();
    return;
  }

  let deleted = 0;
  for (const id of ids) {
    try {
      const result = await deleteFurnitureById(id);
      if (result) deleted++;
    } catch (err) {
      console.error(`failed to delete furniture ${id}:`, err);
    }
  }
  console.log(`\ndeleted ${deleted}/${ids.length} pending row(s).`);

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
