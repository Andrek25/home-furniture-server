import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { UserTable } from "../db/tables/user";
import { FurnitureTable } from "../db/tables/furniture";

export interface DatabaseSchema {
  // user: UserTable;
  furniture: FurnitureTable;
}

export const dialect = new SqliteDialect({
  database: new SQLite("./db.sqlite"),
});

export const db = new Kysely<DatabaseSchema>({
  dialect,
});
