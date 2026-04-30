/**
 * Disk ↔ DB reconciliation. Reports drift between the `furniture` table and
 * the on-disk storage tree, optionally deleting orphan files.
 *
 * Two directions are checked independently:
 *
 *   - Disk − DB  → "orphan files"  (file on disk that no row references)
 *   - DB − Disk  → "zombie rows"   (row whose file is missing on disk)
 *
 * Orphan files are safe to delete with `--apply`. Zombie rows are
 * **report-only**: a `furniture.id` may still be referenced by a PlayFab
 * room JSON (`OriginUrl`), and silently deleting it would make the 404
 * permanent. Surface them and let a human decide.
 *
 * Usage:
 *   pnpm tsx scripts/reconcile.ts            # dry-run (default)
 *   pnpm tsx scripts/reconcile.ts --apply    # delete orphan disk files
 */

import fs from "node:fs";
import path from "node:path";
import { initDatabase, db } from "../src/config/db";
import { initPaths, FURNITURE_PATH, THUMBNAIL_PATH } from "../src/config/path";
import { removeThumbnailURL } from "../src/utils/thumbnails";

const apply = process.argv.includes("--apply");

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith("."));
}

async function main() {
  initPaths();
  initDatabase();

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

  const diskZips = new Set(listFiles(FURNITURE_PATH));
  const diskThumbs = new Set(listFiles(THUMBNAIL_PATH));

  const orphanZips = [...diskZips].filter((f) => !expectedZips.has(f));
  const orphanThumbs = [...diskThumbs].filter((f) => !expectedThumbs.has(f));

  const zombieZipRows = furnitureRows.filter(
    (r) => !diskZips.has(r.local_name)
  );
  const zombieThumbRows = furnitureRows.filter((r) => {
    if (!r.thumbnail) return false;
    return !diskThumbs.has(removeThumbnailURL(r.thumbnail));
  });

  console.log(`mode: ${apply ? "APPLY (orphan files will be deleted)" : "dry-run"}`);
  console.log(`furniture rows: ${furnitureRows.length}`);
  console.log(`disk zips: ${diskZips.size}    disk thumbs: ${diskThumbs.size}`);
  console.log("");

  console.log(`orphan zip files (disk − db): ${orphanZips.length}`);
  for (const f of orphanZips) console.log(`  ${f}`);

  console.log(`\norphan thumb files (disk − db): ${orphanThumbs.length}`);
  for (const f of orphanThumbs) console.log(`  ${f}`);

  console.log(`\nzombie rows missing zip (db − disk): ${zombieZipRows.length}`);
  for (const r of zombieZipRows) console.log(`  id=${r.id} local_name=${r.local_name}`);

  console.log(`\nzombie rows missing thumb (db − disk): ${zombieThumbRows.length}`);
  for (const r of zombieThumbRows) console.log(`  id=${r.id} thumbnail=${r.thumbnail}`);

  if (apply) {
    console.log("\ndeleting orphan files...");
    let deleted = 0;
    for (const f of orphanZips) {
      fs.rmSync(path.join(FURNITURE_PATH, f), { force: true });
      deleted++;
    }
    for (const f of orphanThumbs) {
      fs.rmSync(path.join(THUMBNAIL_PATH, f), { force: true });
      deleted++;
    }
    console.log(`deleted ${deleted} orphan file(s).`);
    console.log("zombie rows untouched (manual review required).");
  } else if (orphanZips.length || orphanThumbs.length) {
    console.log("\nrun with --apply to delete the orphan files listed above.");
  }

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
