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

test("consumeDuplicateToken updates legacy columns AND appends an audit row", async () => {
  const { id } = await makeFurniture();
  const token = await createDuplicateToken(id, "userA", Date.now() + 60_000);
  const consumedAt = Date.now();

  // Pretend the controller just inserted a clone with id `id` (in real flow
  // this would be a different id; here we just need a valid furniture_id).
  await consumeDuplicateToken(token, "userB", consumedAt, id);

  const row = await getDuplicateToken(token);
  assert.equal(row!.consumed_by, "userB");
  assert.equal(Number(row!.consumed_at), consumedAt);

  const audit = await db
    .selectFrom("duplicate_token_claim")
    .selectAll()
    .where("token_id", "=", row!.id)
    .execute();
  assert.equal(audit.length, 1, "exactly one audit row");
  assert.equal(audit[0].claimed_by, "userB");
  assert.equal(Number(audit[0].claimed_at), consumedAt);
  assert.equal(audit[0].furniture_id, id);
});

test("consumeDuplicateToken throws when the token does not exist", async () => {
  await assert.rejects(
    () => consumeDuplicateToken("not-a-real-token", "userB", Date.now(), 1),
    /token not found/
  );
});

test("multiple claims on the same token preserve full audit history", async () => {
  const { id: source } = await makeFurniture();
  const token = await createDuplicateToken(source, "userA", Date.now() + 60_000);

  // Each claim accompanies its own clone insert — fake the clone IDs by
  // creating extra furniture rows.
  makeFile(FURNITURE_PATH, "clone-b.zip");
  const cloneB = await saveFurniture("userB", "clone-b.zip", "room.zip");
  await consumeDuplicateToken(token, "userB", 1000, cloneB.id);

  makeFile(FURNITURE_PATH, "clone-c.zip");
  const cloneC = await saveFurniture("userC", "clone-c.zip", "room.zip");
  await consumeDuplicateToken(token, "userC", 2000, cloneC.id);

  const tokenRow = await getDuplicateToken(token);
  // Legacy columns: most recent claim only.
  assert.equal(tokenRow!.consumed_by, "userC");
  assert.equal(Number(tokenRow!.consumed_at), 2000);

  // Audit table: every claim, in order.
  const audit = await db
    .selectFrom("duplicate_token_claim")
    .selectAll()
    .where("token_id", "=", tokenRow!.id)
    .orderBy("claimed_at", "asc")
    .execute();
  assert.equal(audit.length, 2);
  assert.equal(audit[0].claimed_by, "userB");
  assert.equal(audit[0].furniture_id, cloneB.id);
  assert.equal(audit[1].claimed_by, "userC");
  assert.equal(audit[1].furniture_id, cloneC.id);
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
