/**
 * Kysely database instance and schema type for the SQLite database.
 *
 * `db` and `dialect` are declared as module-level `let` variables and
 * populated by `initDatabase()`. They are `undefined` until that function
 * is called, so no service or migration code should import them before
 * `initDatabase()` has run.
 *
 * The database file is created at `ROOT_PATH/db.sqlite` (resolved from
 * `DISK_ROOT_PATH`). Run `pnpm migrate` to apply pending migrations before
 * starting the server for the first time.
 */

import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { initPaths, ROOT_PATH } from "./path";
import { FurnitureTable } from "../db/tables/furniture";
import { FurnitureOwnerTable } from "../db/tables/furniture-owner";
import { DuplicateTokenTable } from "../db/tables/duplicate-token";

/**
 * Kysely schema mapping table names to their row types.
 * Used as the generic parameter on `Kysely<DatabaseSchema>` and
 * `Transaction<DatabaseSchema>` throughout the codebase.
 */
export interface DatabaseSchema {
  furniture: FurnitureTable;
  furniture_owner: FurnitureOwnerTable;
  duplicate_token: DuplicateTokenTable;
}

/**
 * The Kysely SQLite dialect instance. Exported for use by `kysely.config.ts`
 * (the migration CLI); application code should use `db` directly instead.
 * Populated by `initDatabase()`.
 */
export let dialect: SqliteDialect;

/**
 * The application-wide Kysely query builder. Imported by all service modules.
 * Populated by `initDatabase()` — undefined before that call.
 */
export let db: Kysely<DatabaseSchema>;

/**
 * Initialises the SQLite connection and assigns `dialect` and `db`.
 *
 * Also calls `initPaths()` unconditionally so the storage directories exist
 * before the database file is created. This matters when `initDatabase()` is
 * called directly by the migration CLI (`kysely.config.ts`) rather than via
 * `src/index.ts`, where `initPaths()` would otherwise never run.
 *
 * Safe to call multiple times (subsequent calls reassign `db` and `dialect`
 * to new instances), but in normal operation it should be called exactly once
 * at startup.
 */
export function initDatabase() {
  // initPaths() is also called in index.ts, but calling it here ensures the
  // storage directories exist when the migration CLI entry point is used
  // (`pnpm migrate`), which bypasses index.ts entirely.
  initPaths();

  dialect = new SqliteDialect({
    database: new SQLite(`${ROOT_PATH}/db.sqlite`),
  });
  db = new Kysely<DatabaseSchema>({
    dialect,
  });
}
