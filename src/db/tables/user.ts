import {
  Insertable,
  Updateable,
  type Generated,
  type Selectable,
} from "kysely";

export interface UserTable {
  id: Generated<number>;
  created_at?: Date;
}

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;
