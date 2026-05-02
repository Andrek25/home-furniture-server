import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE duplicate_token_claim (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER NOT NULL REFERENCES duplicate_token(id) ON DELETE CASCADE,
      claimed_by VARCHAR NOT NULL,
      claimed_at BIGINT NOT NULL,
      furniture_id INTEGER REFERENCES furniture(id) ON DELETE SET NULL
    )
  `.execute(db);

  await db.schema
    .createIndex("idx_duplicate_token_claim_token_id")
    .on("duplicate_token_claim")
    .column("token_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_duplicate_token_claim_token_id").execute();
  await sql`DROP TABLE duplicate_token_claim`.execute(db);
}
