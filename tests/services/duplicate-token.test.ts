import "../_env";

import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  db,
  FURNITURE_PATH,
  migrateLatest,
  resetTables,
  cleanupAll,
  makeFile,
} from "../_helpers";
import {
  createDuplicateToken,
  getDuplicateToken,
  consumeDuplicateToken,
  deleteDuplicateToken,
} from "../../src/services/duplicate-token";
import { saveFurniture } from "../../src/services/furniture";

before(migrateLatest);
beforeEach(resetTables);
after(cleanupAll);

async function makeFurniture(ownerId = "userA") {
  makeFile(FURNITURE_PATH, "model.zip");
  return saveFurniture(ownerId, "model.zip", "room.zip");
}

test("createDuplicateToken returns a 48-char hex string and persists it", async () => {
  const { id } = await makeFurniture();
  const expires = Date.now() + 60_000;

  const token = await createDuplicateToken(id, "userA", expires);

  assert.equal(typeof token, "string");
  assert.equal(token.length, 48);
  assert.match(token, /^[0-9a-f]{48}$/);

  const row = await db
    .selectFrom("duplicate_token")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();
  assert.ok(row, "row should exist");
  assert.equal(row!.furniture_id, id);
  assert.equal(row!.owner_id, "userA");
  assert.equal(Number(row!.expires), expires);
});

test("getDuplicateToken returns the row for a known token, undefined otherwise", async () => {
  const { id } = await makeFurniture();
  const token = await createDuplicateToken(id, "userA", Date.now() + 60_000);

  const found = await getDuplicateToken(token);
  assert.ok(found);
  assert.equal(found!.furniture_id, id);

  const missing = await getDuplicateToken("does-not-exist");
  assert.equal(missing, undefined);
});

test("consumeDuplicateToken sets consumed_by and consumed_at", async () => {
  const { id } = await makeFurniture();
  const token = await createDuplicateToken(id, "userA", Date.now() + 60_000);
  const consumedAt = Date.now();

  await consumeDuplicateToken(token, "userB", consumedAt);

  const row = await getDuplicateToken(token);
  assert.equal(row!.consumed_by, "userB");
  assert.equal(Number(row!.consumed_at), consumedAt);
});

test("deleteDuplicateToken removes the row", async () => {
  const { id } = await makeFurniture();
  const token = await createDuplicateToken(id, "userA", Date.now() + 60_000);

  await deleteDuplicateToken(token);

  assert.equal(await getDuplicateToken(token), undefined);
});

test("two createDuplicateToken calls produce different tokens", async () => {
  const { id } = await makeFurniture();
  const t1 = await createDuplicateToken(id, "userA", Date.now() + 60_000);
  const t2 = await createDuplicateToken(id, "userA", Date.now() + 60_000);

  assert.notEqual(t1, t2);
});
