import {
  Insertable,
  Updateable,
  type Generated,
  type Selectable,
} from "kysely";

export interface FurnitureTable {
  id: Generated<number>;
  local_name: string;
  file_name: string;
  thumbnail?: string;
  owner_id: string;
  created_at?: Date;
  updated_at?: Date;
}

export type Furniture = Selectable<FurnitureTable>;
export type NewFurniture = Insertable<FurnitureTable>;
export type FurnitureUpdate = Updateable<FurnitureTable>;
