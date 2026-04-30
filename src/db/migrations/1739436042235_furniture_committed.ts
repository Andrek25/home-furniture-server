import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Default 1 = "committed" so existing rows and uploads from clients that
  // don't yet send `pending=true` are unaffected by the sweeper. Only
  // explicitly opt-in pending uploads are eligible for cleanup.
  await sql`
    ALTER TABLE furniture
    ADD COLUMN committed INTEGER NOT NULL DEFAULT 1
  `.execute(db);

  await db.schema
    .createIndex("idx_furniture_committed")
    .on("furniture")
    .column("committed")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_furniture_committed").execute();
  await sql`ALTER TABLE furniture DROP COLUMN committed`.execute(db);
}
