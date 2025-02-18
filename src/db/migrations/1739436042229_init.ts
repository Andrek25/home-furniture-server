import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // await db.schema
  //   .createTable("user")
  //   .addColumn("id", "varchar", (col) => col.notNull().primaryKey())
  //   .addColumn("created_at", "timestamp", (col) =>
  //     col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
  //   )
  //   .execute();

  await db.schema
    .createTable("furniture")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("local_name", "varchar", (col) => col.notNull())
    .addColumn("file_name", "varchar", (col) => col.notNull())
    .addColumn("thumbnail", "varchar")
    // .addColumn("user_id", "varchar", (col) =>
    //   col.references("user.id").notNull().onDelete("cascade")
    // )
    .addColumn("owner_id", "varchar", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // await db.schema.dropTable("user").execute();
  await db.schema.dropTable("furniture").execute();
}
