import { Generated, ColumnType } from 'kysely';

export interface DuplicateTokenTable {
  id: Generated<number>;
  token: string;
  furniture_id: number;
  owner_id: string;
  expires: ColumnType<number, number | undefined, number | undefined>;
  consumed_by: ColumnType<string, string | null, string | null>;
  consumed_at: ColumnType<number, number | null, number | null>;
}
