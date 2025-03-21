import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { FurnitureTable } from "../db/tables/furniture";
import { FurnitureOwnerTable } from "../db/tables/furniture-owner";
import { initPaths, ROOT_PATH } from "./path";

export interface DatabaseSchema {
  furniture: FurnitureTable;
  furniture_owner: FurnitureOwnerTable;
}

export let dialect: SqliteDialect;

export let db: Kysely<DatabaseSchema>;

export function initDatabase() {
  // This is called in the index.ts file too, but I'm calling it here to make sure the paths are initialized before the database is initialized.
  // Otherwise, the database will not be created when executing the migrations (npm run migrate).
  initPaths();

  dialect = new SqliteDialect({
    database: new SQLite(`${ROOT_PATH}/db.sqlite`),
  });
  db = new Kysely<DatabaseSchema>({
    dialect,
  });
}
