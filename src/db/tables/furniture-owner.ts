import {
  Insertable,
  Updateable,
  type Generated,
  type Selectable,
} from "kysely";

export interface FurnitureOwnerTable {
  id: Generated<number>;
  furniture_id: number;
  owner_id: string;
  created_at?: Date;
}

export type FurnitureOwner = Selectable<FurnitureOwnerTable>;
export type NewFurnitureOwner = Insertable<FurnitureOwnerTable>;
export type FurnitureOwnerUpdate = Updateable<FurnitureOwnerTable>;
