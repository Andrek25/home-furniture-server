import fs from "node:fs";
import path from "node:path";
import { initDatabase, db } from "../src/config/db";
import { initPaths, FURNITURE_PATH, THUMBNAIL_PATH } from "../src/config/path";
import {
  saveFurniture,
  saveFurnitureFromExisting,
  deleteFurnitureById,
  replaceFurnitureFile,
  getFurnitureById,
  commitFurniture,
  findUncommittedFurnitureOlderThan,
} from "../src/services/furniture";
import { consumeDuplicateToken } from "../src/services/duplicate-token";

initPaths();
initDatabase();

function makeFile(dir: string, name: string, content = "data"): string {
  fs.writeFileSync(path.join(dir, name), content);
  return name;
}

function exists(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name));
}

async function reset() {
  await db.deleteFrom("duplicate_token").execute();
  await db.deleteFrom("furniture_owner").execute();
  await db.deleteFrom("furniture").execute();
  for (const f of fs.readdirSync(FURNITURE_PATH)) {
    fs.rmSync(path.join(FURNITURE_PATH, f), { force: true });
  }
  for (const f of fs.readdirSync(THUMBNAIL_PATH)) {
    fs.rmSync(path.join(THUMBNAIL_PATH, f), { force: true });
  }
}

function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  PASS: ${msg}`);
  else {
    console.log(`  FAIL: ${msg}`);
    process.exitCode = 1;
  }
}

async function testSharedDelete() {
  console.log("\n[Test 1] Shared delete preserves model file for remaining room");
  await reset();

  makeFile(FURNITURE_PATH, "model-uuid.zip");
  makeFile(THUMBNAIL_PATH, "thumb-a.png");

  const a = await saveFurniture("userA", "model-uuid.zip", "room.zip", "thumb-a.png");
  const source = await getFurnitureById(a.id);
  if (!source) throw new Error("source missing");

  const b = await saveFurnitureFromExisting("userA", source);
  const bRow = await getFurnitureById(b.id);

  assert(bRow?.local_name === "model-uuid.zip", "copy reuses local_name");
  assert(bRow?.thumbnail !== source.thumbnail, "copy has its own thumbnail URL");
  assert(exists(FURNITURE_PATH, "model-uuid.zip"), "model file exists after copy");

  await deleteFurnitureById(a.id, { ownerId: "userA" });

  assert(exists(FURNITURE_PATH, "model-uuid.zip"), "model file STILL exists after deleting one sharer");
  assert(!exists(THUMBNAIL_PATH, "thumb-a.png"), "thumbnail of deleted room is gone");

  const bAfter = await getFurnitureById(b.id);
  assert(bAfter !== undefined, "copy still exists in DB");

  await deleteFurnitureById(b.id, { ownerId: "userA" });
  assert(!exists(FURNITURE_PATH, "model-uuid.zip"), "model file gone once no room references it");
}

async function testUnsharedDelete() {
  console.log("\n[Test 2] Unshared delete removes model file");
  await reset();

  makeFile(FURNITURE_PATH, "solo.zip");
  makeFile(THUMBNAIL_PATH, "thumb-s.png");
  const a = await saveFurniture("userA", "solo.zip", "room.zip", "thumb-s.png");

  assert(exists(FURNITURE_PATH, "solo.zip"), "file exists before delete");
  await deleteFurnitureById(a.id, { ownerId: "userA" });
  assert(!exists(FURNITURE_PATH, "solo.zip"), "file gone after solo delete");
}

async function testSharedReplace() {
  console.log("\n[Test 3] Replace file on shared model does not touch old file");
  await reset();

  makeFile(FURNITURE_PATH, "shared.zip", "original");
  makeFile(THUMBNAIL_PATH, "thumb-a.png");
  const a = await saveFurniture("userA", "shared.zip", "room.zip", "thumb-a.png");
  const source = await getFurnitureById(a.id);
  if (!source) throw new Error("source missing");
  const b = await saveFurnitureFromExisting("userA", source);

  makeFile(FURNITURE_PATH, "new-upload.zip", "new");
  const bRow = await getFurnitureById(b.id);
  if (!bRow) throw new Error("b missing");
  await replaceFurnitureFile(bRow, "new-upload.zip", "newroom.zip");

  assert(exists(FURNITURE_PATH, "shared.zip"), "old shared file preserved");
  assert(exists(FURNITURE_PATH, "new-upload.zip"), "new file in place");

  const aAfter = await getFurnitureById(a.id);
  const bAfter = await getFurnitureById(b.id);
  assert(aAfter?.local_name === "shared.zip", "A still points to shared.zip");
  assert(bAfter?.local_name === "new-upload.zip", "B now points to new-upload.zip");
}

async function testUnsharedReplace() {
  console.log("\n[Test 4] Replace file on solo model deletes old file");
  await reset();

  makeFile(FURNITURE_PATH, "solo.zip", "old");
  makeFile(THUMBNAIL_PATH, "thumb-s.png");
  const a = await saveFurniture("userA", "solo.zip", "room.zip", "thumb-s.png");
  const aRow = await getFurnitureById(a.id);
  if (!aRow) throw new Error("a missing");

  makeFile(FURNITURE_PATH, "new-upload.zip", "new");
  await replaceFurnitureFile(aRow, "new-upload.zip", "newroom.zip");

  assert(!exists(FURNITURE_PATH, "solo.zip"), "old solo file deleted");
  assert(exists(FURNITURE_PATH, "new-upload.zip"), "new file in place");
}

async function testTokenCleanup() {
  console.log("\n[Test 5] Deleting room cleans up duplicate tokens");
  await reset();

  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");
  await db
    .insertInto("duplicate_token")
    .values({ token: "tok-abc", furniture_id: a.id, owner_id: "userA", expires: 9999999999999 })
    .execute();

  const before = await db.selectFrom("duplicate_token").select("id").where("furniture_id", "=", a.id).execute();
  assert(before.length === 1, "token exists before delete");

  await deleteFurnitureById(a.id, { ownerId: "userA" });

  const after = await db.selectFrom("duplicate_token").select("id").where("furniture_id", "=", a.id).execute();
  assert(after.length === 0, "token removed after delete");
}

async function testOwnershipIsolation() {
  console.log("\n[Test 6] getFurnitureById with ownerId filters out non-owners");
  await reset();

  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");

  const asA = await getFurnitureById(a.id, { ownerId: "userA" });
  const asB = await getFurnitureById(a.id, { ownerId: "userB" });
  assert(asA !== undefined, "owner can see their room");
  assert(asB === undefined, "non-owner cannot see the room");
}

async function testUniqueOwnership() {
  console.log("\n[Test 7] furniture_owner rejects duplicate (furniture_id, owner_id)");
  await reset();

  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");

  let rejected = false;
  try {
    await db
      .insertInto("furniture_owner")
      .values({ furniture_id: a.id, owner_id: "userA" })
      .execute();
  } catch (e) {
    rejected = true;
  }
  assert(rejected, "unique constraint enforced");
}

async function testTokenClaimAudit() {
  console.log("\n[Test 8] consumeDuplicateToken appends one audit row per claim");
  await reset();

  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");
  const tokenStr = "tok-audit";
  await db
    .insertInto("duplicate_token")
    .values({ token: tokenStr, furniture_id: a.id, owner_id: "userA", expires: 9999999999999 })
    .execute();

  // Two consecutive claims by different users, mimicking the controller flow
  // (each claim accompanies a clone insert; we fake the clone IDs).
  const cloneB = await saveFurniture("userB", "x.zip", "room.zip");
  await consumeDuplicateToken(tokenStr, "userB", 1000, cloneB.id);

  const cloneC = await saveFurniture("userC", "x.zip", "room.zip");
  await consumeDuplicateToken(tokenStr, "userC", 2000, cloneC.id);

  const tokenRow = await db.selectFrom("duplicate_token").selectAll().where("token", "=", tokenStr).executeTakeFirstOrThrow();
  const claims = await db
    .selectFrom("duplicate_token_claim")
    .selectAll()
    .where("token_id", "=", tokenRow.id)
    .orderBy("claimed_at", "asc")
    .execute();

  assert(claims.length === 2, "two audit rows after two claims");
  assert(claims[0].claimed_by === "userB" && claims[0].furniture_id === cloneB.id, "first claim audit preserved");
  assert(claims[1].claimed_by === "userC" && claims[1].furniture_id === cloneC.id, "second claim audit preserved");
  assert(tokenRow.consumed_by === "userC" && Number(tokenRow.consumed_at) === 2000, "legacy columns reflect last claim");
}

async function testTokenClaimCascade() {
  console.log("\n[Test 9] Deleting source furniture wipes token claim audit rows");
  await reset();

  makeFile(FURNITURE_PATH, "y.zip");
  const a = await saveFurniture("userA", "y.zip", "room.zip");
  const tokenStr = "tok-cascade";
  await db
    .insertInto("duplicate_token")
    .values({ token: tokenStr, furniture_id: a.id, owner_id: "userA", expires: 9999999999999 })
    .execute();
  const cloneB = await saveFurniture("userB", "y.zip", "room.zip");
  await consumeDuplicateToken(tokenStr, "userB", 1000, cloneB.id);

  const beforeClaims = await db.selectFrom("duplicate_token_claim").select("id").execute();
  assert(beforeClaims.length === 1, "audit row exists before source delete");

  await deleteFurnitureById(a.id, { ownerId: "userA" });

  const afterTokens = await db.selectFrom("duplicate_token").select("id").where("token", "=", tokenStr).execute();
  const afterClaims = await db.selectFrom("duplicate_token_claim").select("id").execute();
  assert(afterTokens.length === 0, "token deleted with source");
  assert(afterClaims.length === 0, "audit rows cleaned up alongside token");
}

async function testPendingUploadAndCommit() {
  console.log("\n[Test 10] Pending upload defaults committed=0; commitFurniture flips it");
  await reset();

  makeFile(FURNITURE_PATH, "p.zip");
  const a = await saveFurniture("userA", "p.zip", "room.zip", undefined, undefined, true);
  const beforeRow = await db.selectFrom("furniture").select(["committed"]).where("id", "=", a.id).executeTakeFirstOrThrow();
  assert(Number(beforeRow.committed) === 0, "pending upload inserted with committed=0");

  const ok = await commitFurniture(a.id, "userA");
  assert(ok === true, "commitFurniture returned true for owner");
  const afterRow = await db.selectFrom("furniture").select(["committed"]).where("id", "=", a.id).executeTakeFirstOrThrow();
  assert(Number(afterRow.committed) === 1, "row is committed=1 after commit");

  // Idempotent
  const okAgain = await commitFurniture(a.id, "userA");
  assert(okAgain === true, "second commit is a no-op success");

  // Non-owner cannot commit
  const okOther = await commitFurniture(a.id, "userB");
  assert(okOther === false, "non-owner commit returns false");
}

async function testSweeperFiltersByAgeAndCommittedFlag() {
  console.log("\n[Test 11] Sweeper picks up only uncommitted rows past the age cutoff");
  await reset();

  makeFile(FURNITURE_PATH, "old-pending.zip");
  makeFile(FURNITURE_PATH, "fresh-pending.zip");
  makeFile(FURNITURE_PATH, "old-committed.zip");

  const oldPending = await saveFurniture("userA", "old-pending.zip", "room.zip", undefined, undefined, true);
  const freshPending = await saveFurniture("userA", "fresh-pending.zip", "room.zip", undefined, undefined, true);
  const oldCommitted = await saveFurniture("userA", "old-committed.zip", "room.zip", undefined, undefined, false);

  // Backdate the two "old" rows by 30 minutes. Use SQLite's "YYYY-MM-DD HH:MM:SS"
  // format so it compares lexicographically against datetime('now', ...) inside
  // findUncommittedFurnitureOlderThan.
  const past = new Date(Date.now() - 30 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  await db.updateTable("furniture").set({ created_at: past as any }).where("id", "=", oldPending.id).execute();
  await db.updateTable("furniture").set({ created_at: past as any }).where("id", "=", oldCommitted.id).execute();

  const candidates = await findUncommittedFurnitureOlderThan(10);
  assert(candidates.includes(oldPending.id), "old pending row picked up");
  assert(!candidates.includes(freshPending.id), "fresh pending row excluded by age");
  assert(!candidates.includes(oldCommitted.id), "old committed row excluded by flag");
  assert(candidates.length === 1, "exactly one candidate");

  // Sweep it
  await deleteFurnitureById(oldPending.id);
  assert(!exists(FURNITURE_PATH, "old-pending.zip"), "swept file is gone from disk");
  assert(exists(FURNITURE_PATH, "fresh-pending.zip"), "fresh pending file preserved");
  assert(exists(FURNITURE_PATH, "old-committed.zip"), "committed file preserved");

  const remaining = await db.selectFrom("furniture").select("id").execute();
  assert(remaining.length === 2, "only swept row removed from DB");
}

async function main() {
  try {
    await testSharedDelete();
    await testUnsharedDelete();
    await testSharedReplace();
    await testUnsharedReplace();
    await testTokenCleanup();
    await testOwnershipIsolation();
    await testUniqueOwnership();
    await testTokenClaimAudit();
    await testTokenClaimCascade();
    await testPendingUploadAndCommit();
    await testSweeperFiltersByAgeAndCommittedFlag();
    console.log("\ndone.");
  } finally {
    await reset();
    await db.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
