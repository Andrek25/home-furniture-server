import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DELETE FROM furniture_owner
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM furniture_owner
      GROUP BY furniture_id, owner_id
    )
  `.execute(db);

  await sql`
    CREATE TABLE furniture_owner_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      furniture_id INTEGER NOT NULL REFERENCES furniture(id) ON DELETE CASCADE,
      owner_id VARCHAR NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db);

  await sql`
    INSERT INTO furniture_owner_new (furniture_id, owner_id, created_at)
    SELECT furniture_id, owner_id, created_at FROM furniture_owner
  `.execute(db);

  await sql`DROP TABLE furniture_owner`.execute(db);
  await sql`ALTER TABLE furniture_owner_new RENAME TO furniture_owner`.execute(db);

  await db.schema
    .createIndex("idx_furniture_owner_unique")
    .on("furniture_owner")
    .columns(["furniture_id", "owner_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_furniture_local_name")
    .on("furniture")
    .column("local_name")
    .execute();

  await db.schema
    .createIndex("idx_duplicate_token_furniture_id")
    .on("duplicate_token")
    .column("furniture_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_duplicate_token_furniture_id").execute();
  await db.schema.dropIndex("idx_furniture_local_name").execute();
  await db.schema.dropIndex("idx_furniture_owner_unique").execute();

  await sql`
    CREATE TABLE furniture_owner_old (
      furniture_id INTEGER REFERENCES furniture(id) ON DELETE CASCADE,
      owner_id VARCHAR NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db);

  await sql`
    INSERT INTO furniture_owner_old (furniture_id, owner_id, created_at)
    SELECT furniture_id, owner_id, created_at FROM furniture_owner
  `.execute(db);

  await sql`DROP TABLE furniture_owner`.execute(db);
  await sql`ALTER TABLE furniture_owner_old RENAME TO furniture_owner`.execute(db);
}
