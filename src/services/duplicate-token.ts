import { db } from "../config/db";
import crypto from "node:crypto";

export async function createDuplicateToken(furnitureId: number, ownerId: string, expires: number): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  await db.insertInto("duplicate_token")
    .values({ token, furniture_id: furnitureId, owner_id: ownerId, expires })
    .execute();
  return token;
}

export async function getDuplicateToken(token: string) {
  return await db.selectFrom("duplicate_token")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();
}

export async function consumeDuplicateToken(token: string, consumedBy: string, consumedAt: number) {
  await db.updateTable("duplicate_token")
    .set({ consumed_by: consumedBy, consumed_at: consumedAt })
    .where("token", "=", token)
    .execute();
}

export async function deleteDuplicateToken(token: string) {
  await db.deleteFrom("duplicate_token")
    .where("token", "=", token)
    .execute();
}
