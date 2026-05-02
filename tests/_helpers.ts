import { TMP_ROOT } from "./_env";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";

import * as dbModule from "../src/config/db";
import {
  initPaths,
  FURNITURE_PATH,
  THUMBNAIL_PATH,
} from "../src/config/path";

initPaths();
dbModule.initDatabase();

export const db = dbModule.db;
export { TMP_ROOT, FURNITURE_PATH, THUMBNAIL_PATH };

// Like kysely's FileMigrationProvider, but converts paths to file:// URLs so
// dynamic import() works on Windows under the ESM loader (otherwise tsx --test
// fails with ERR_UNSUPPORTED_ESM_URL_SCHEME on `D:\...`).
class FileURLMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const out: Record<string, Migration> = {};
    const files = await fs.promises.readdir(this.migrationFolder);
    for (const fileName of files) {
      const isLoadable =
        (fileName.endsWith(".ts") && !fileName.endsWith(".d.ts")) ||
        fileName.endsWith(".js") ||
        fileName.endsWith(".mjs");
      if (!isLoadable) continue;

      const url = pathToFileURL(
        path.join(this.migrationFolder, fileName)
      ).href;
      const mod = (await import(url)) as { default?: Migration } & Migration;
      const key = fileName.substring(0, fileName.lastIndexOf("."));
      const migration =
        mod?.default && typeof mod.default.up === "function"
          ? mod.default
          : typeof mod?.up === "function"
            ? mod
            : undefined;
      if (migration) out[key] = migration;
    }
    return out;
  }
}

export async function migrateLatest() {
  const migrator = new Migrator({
    db,
    provider: new FileURLMigrationProvider(
      // Tests always run from the project root (via `pnpm test`).
      path.resolve(process.cwd(), "src/db/migrations")
    ),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    console.error("Migration results:", results);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function resetTables() {
  await db.deleteFrom("duplicate_token").execute();
  await db.deleteFrom("furniture_owner").execute();
  await db.deleteFrom("furniture").execute();
  for (const f of fs.readdirSync(FURNITURE_PATH)) {
    fs.rmSync(path.join(FURNITURE_PATH, f), { force: true, recursive: true });
  }
  for (const f of fs.readdirSync(THUMBNAIL_PATH)) {
    fs.rmSync(path.join(THUMBNAIL_PATH, f), { force: true, recursive: true });
  }
}

export function makeFile(dir: string, name: string, content: string = "data") {
  fs.writeFileSync(path.join(dir, name), content);
  return name;
}

export function readFile(dir: string, name: string) {
  return fs.readFileSync(path.join(dir, name), "utf8");
}

export function exists(dir: string, name: string) {
  return fs.existsSync(path.join(dir, name));
}

export async function cleanupAll() {
  await db.destroy();
  // On Windows the SQLite handle release lags briefly behind db.destroy();
  // generous retries keep us from leaving empty test dirs behind in $TEMP.
  fs.rmSync(TMP_ROOT, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100,
  });
}
