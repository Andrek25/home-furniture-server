import { Kysely, Migration } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('duplicate_token')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('token', 'varchar', (col) => col.notNull().unique())
    .addColumn('furniture_id', 'integer', (col) => col.notNull())
    .addColumn('owner_id', 'varchar', (col) => col.notNull())
    .addColumn('expires', 'bigint', (col) => col.notNull())
    .addColumn('consumed_by', 'varchar')
    .addColumn('consumed_at', 'bigint')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('duplicate_token').execute();
}
