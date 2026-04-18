import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE duplicate_token_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR NOT NULL UNIQUE,
      furniture_id INTEGER NOT NULL REFERENCES furniture(id) ON DELETE CASCADE,
      owner_id VARCHAR NOT NULL,
      expires BIGINT NOT NULL,
      consumed_by VARCHAR,
      consumed_at BIGINT
    )
  `.execute(db);

  await sql`
    INSERT INTO duplicate_token_new (id, token, furniture_id, owner_id, expires, consumed_by, consumed_at)
    SELECT id, token, furniture_id, owner_id, expires, consumed_by, consumed_at
    FROM duplicate_token
    WHERE furniture_id IN (SELECT id FROM furniture)
  `.execute(db);

  await sql`DROP TABLE duplicate_token`.execute(db);
  await sql`ALTER TABLE duplicate_token_new RENAME TO duplicate_token`.execute(db);

  await db.schema
    .createIndex("idx_duplicate_token_token")
    .on("duplicate_token")
    .column("token")
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_duplicate_token_token").execute();

  await sql`
    CREATE TABLE duplicate_token_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR NOT NULL UNIQUE,
      furniture_id INTEGER NOT NULL,
      owner_id VARCHAR NOT NULL,
      expires BIGINT NOT NULL,
      consumed_by VARCHAR,
      consumed_at BIGINT
    )
  `.execute(db);

  await sql`
    INSERT INTO duplicate_token_old (id, token, furniture_id, owner_id, expires, consumed_by, consumed_at)
    SELECT id, token, furniture_id, owner_id, expires, consumed_by, consumed_at
    FROM duplicate_token
  `.execute(db);

  await sql`DROP TABLE duplicate_token`.execute(db);
  await sql`ALTER TABLE duplicate_token_old RENAME TO duplicate_token`.execute(db);
}
