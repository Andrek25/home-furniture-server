import { type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("furniture")
    .addColumn("scene_base_id", "varchar")
    .execute();

  await db.schema
    .createIndex("idx_furniture_scene_base_id")
    .on("furniture")
    .column("scene_base_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_furniture_scene_base_id").execute();
  await db.schema
    .alterTable("furniture")
    .dropColumn("scene_base_id")
    .execute();
}
