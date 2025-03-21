import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("furniture")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("local_name", "varchar", (col) => col.notNull())
    .addColumn("file_name", "varchar", (col) => col.notNull())
    .addColumn("thumbnail", "varchar")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  await db.schema
    .createTable("furniture_owner")
    .addColumn("furniture_id", "integer", (col) =>
      col.references("furniture.id").onDelete("cascade")
    )
    .addColumn("owner_id", "varchar", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("furniture_owner").execute();
  await db.schema.dropTable("furniture").execute();
}
