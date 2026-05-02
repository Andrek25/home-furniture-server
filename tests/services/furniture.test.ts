import "../_env";

import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import {
  db,
  FURNITURE_PATH,
  THUMBNAIL_PATH,
  migrateLatest,
  resetTables,
  cleanupAll,
  makeFile,
  readFile,
  exists,
} from "../_helpers";
import {
  saveFurniture,
  saveFurnitureFromExisting,
  deleteFurnitureById,
  replaceFurnitureFile,
  replaceFurnitureThumbnail,
  getFurnitureById,
  getFurnituresByOwnerId,
  getFurnitureOwners,
  commitFurniture,
  findUncommittedFurnitureOlderThan,
} from "../../src/services/furniture";
import { removeThumbnailURL } from "../../src/utils/thumbnails";

before(migrateLatest);
beforeEach(resetTables);
after(cleanupAll);

test("shared delete preserves model file for remaining room", async () => {
  makeFile(FURNITURE_PATH, "model-uuid.zip");
  makeFile(THUMBNAIL_PATH, "thumb-a.png");

  const a = await saveFurniture(
    "userA",
    "model-uuid.zip",
    "room.zip",
    "thumb-a.png"
  );
  const source = await getFurnitureById(a.id);
  assert.ok(source);

  const b = await saveFurnitureFromExisting("userA", source!);
  const bRow = await getFurnitureById(b.id);

  assert.equal(bRow!.local_name, "model-uuid.zip");
  assert.notEqual(bRow!.thumbnail, source!.thumbnail);
  assert.equal(exists(FURNITURE_PATH, "model-uuid.zip"), true);

  await deleteFurnitureById(a.id, { ownerId: "userA" });

  assert.equal(
    exists(FURNITURE_PATH, "model-uuid.zip"),
    true,
    "model file STILL exists after deleting one sharer"
  );
  assert.equal(
    exists(THUMBNAIL_PATH, "thumb-a.png"),
    false,
    "thumbnail of deleted room is gone"
  );

  const bAfter = await getFurnitureById(b.id);
  assert.ok(bAfter, "copy still exists in DB");

  await deleteFurnitureById(b.id, { ownerId: "userA" });
  assert.equal(
    exists(FURNITURE_PATH, "model-uuid.zip"),
    false,
    "model file gone once no room references it"
  );
});

test("unshared delete removes the model file", async () => {
  makeFile(FURNITURE_PATH, "solo.zip");
  makeFile(THUMBNAIL_PATH, "thumb-s.png");
  const a = await saveFurniture(
    "userA",
    "solo.zip",
    "room.zip",
    "thumb-s.png"
  );

  assert.equal(exists(FURNITURE_PATH, "solo.zip"), true);
  await deleteFurnitureById(a.id, { ownerId: "userA" });
  assert.equal(exists(FURNITURE_PATH, "solo.zip"), false);
});

test("replaceFurnitureFile on a shared model preserves the old file", async () => {
  makeFile(FURNITURE_PATH, "shared.zip", "original");
  makeFile(THUMBNAIL_PATH, "thumb-a.png");
  const a = await saveFurniture(
    "userA",
    "shared.zip",
    "room.zip",
    "thumb-a.png"
  );
  const source = await getFurnitureById(a.id);
  assert.ok(source);
  const b = await saveFurnitureFromExisting("userA", source!);

  makeFile(FURNITURE_PATH, "new-upload.zip", "new");
  const bRow = await getFurnitureById(b.id);
  assert.ok(bRow);
  await replaceFurnitureFile(bRow!, "new-upload.zip", "newroom.zip");

  assert.equal(exists(FURNITURE_PATH, "shared.zip"), true);
  assert.equal(exists(FURNITURE_PATH, "new-upload.zip"), true);

  const aAfter = await getFurnitureById(a.id);
  const bAfter = await getFurnitureById(b.id);
  assert.equal(aAfter!.local_name, "shared.zip");
  assert.equal(bAfter!.local_name, "new-upload.zip");
});

test("replaceFurnitureFile on a solo model deletes the old file", async () => {
  makeFile(FURNITURE_PATH, "solo.zip", "old");
  makeFile(THUMBNAIL_PATH, "thumb-s.png");
  const a = await saveFurniture(
    "userA",
    "solo.zip",
    "room.zip",
    "thumb-s.png"
  );
  const aRow = await getFurnitureById(a.id);
  assert.ok(aRow);

  makeFile(FURNITURE_PATH, "new-upload.zip", "new");
  await replaceFurnitureFile(aRow!, "new-upload.zip", "newroom.zip");

  assert.equal(exists(FURNITURE_PATH, "solo.zip"), false);
  assert.equal(exists(FURNITURE_PATH, "new-upload.zip"), true);
});

test("deleting a room cleans up its duplicate tokens", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");

  await db
    .insertInto("duplicate_token")
    .values({
      token: "tok-abc",
      furniture_id: a.id,
      owner_id: "userA",
      expires: 9_999_999_999_999,
    })
    .execute();

  const before = await db
    .selectFrom("duplicate_token")
    .select("id")
    .where("furniture_id", "=", a.id)
    .execute();
  assert.equal(before.length, 1);

  await deleteFurnitureById(a.id, { ownerId: "userA" });

  const after = await db
    .selectFrom("duplicate_token")
    .select("id")
    .where("furniture_id", "=", a.id)
    .execute();
  assert.equal(after.length, 0);
});

test("getFurnitureById with ownerId filters out non-owners", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");

  const asA = await getFurnitureById(a.id, { ownerId: "userA" });
  const asB = await getFurnitureById(a.id, { ownerId: "userB" });
  assert.ok(asA, "owner can see their room");
  assert.equal(asB, undefined, "non-owner cannot see the room");
});

test("furniture_owner rejects duplicate (furniture_id, owner_id)", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");

  await assert.rejects(() =>
    db
      .insertInto("furniture_owner")
      .values({ furniture_id: a.id, owner_id: "userA" })
      .execute()
  );
});

test("getFurnituresByOwnerId returns only the caller's rows, ordered by created_at asc", async () => {
  makeFile(FURNITURE_PATH, "one.zip");
  makeFile(FURNITURE_PATH, "two.zip");
  makeFile(FURNITURE_PATH, "three.zip");

  const first = await saveFurniture("userA", "one.zip", "one.zip");
  // Small delay so created_at differs even at second-level granularity.
  await new Promise((r) => setTimeout(r, 1100));
  const second = await saveFurniture("userA", "two.zip", "two.zip");
  await saveFurniture("userB", "three.zip", "three.zip");

  const rows = await getFurnituresByOwnerId("userA");

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.id),
    [first.id, second.id]
  );
  assert.ok(rows.every((r) => r.file_name.length > 0));
});

test("replaceFurnitureThumbnail swaps the file on disk and updates the DB URL", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  makeFile(THUMBNAIL_PATH, "old.png", "old-bytes");
  const a = await saveFurniture("userA", "x.zip", "room.zip", "old.png");

  const row = await getFurnitureById(a.id);
  assert.ok(row);
  const oldThumbnail = row!.thumbnail!;
  const oldFile = removeThumbnailURL(oldThumbnail);

  // Multer would have just written the new upload into THUMBNAIL_PATH under
  // its original filename. The service renames it to <uuid><ext>.
  makeFile(THUMBNAIL_PATH, "incoming.png", "new-bytes");

  await replaceFurnitureThumbnail(row!, "incoming.png");

  assert.equal(exists(THUMBNAIL_PATH, oldFile), false);
  assert.equal(exists(THUMBNAIL_PATH, "incoming.png"), false);

  const updated = await getFurnitureById(a.id);
  assert.ok(updated!.thumbnail);
  assert.notEqual(updated!.thumbnail, oldThumbnail);
  assert.match(updated!.thumbnail!, /^\/thumbnails\/[0-9a-f-]+\.png$/);

  const newFile = removeThumbnailURL(updated!.thumbnail!);
  assert.equal(exists(THUMBNAIL_PATH, newFile), true);
  assert.equal(readFile(THUMBNAIL_PATH, newFile), "new-bytes");
});

test("saveFurnitureFromExisting without a thumbnail copies the source thumbnail file", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  makeFile(THUMBNAIL_PATH, "src.png", "img-bytes");
  const a = await saveFurniture("userA", "x.zip", "room.zip", "src.png");
  const source = await getFurnitureById(a.id);
  assert.ok(source);

  const b = await saveFurnitureFromExisting("userB", source!);

  const bRow = await getFurnitureById(b.id);
  assert.ok(bRow!.thumbnail);
  assert.notEqual(bRow!.thumbnail, source!.thumbnail);

  const copyName = removeThumbnailURL(bRow!.thumbnail!);
  assert.notEqual(copyName, "src.png");
  assert.equal(exists(THUMBNAIL_PATH, copyName), true);
  assert.equal(readFile(THUMBNAIL_PATH, copyName), "img-bytes");

  // Original is still there.
  assert.equal(exists(THUMBNAIL_PATH, "src.png"), true);
});

test("getFurnitureOwners returns every owner of a furniture", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  const a = await saveFurniture("userA", "x.zip", "room.zip");
  // Add userB as a co-owner the same way the app would via duplication flow:
  // by inserting directly into furniture_owner.
  await db
    .insertInto("furniture_owner")
    .values({ furniture_id: a.id, owner_id: "userB" })
    .execute();

  const owners = await getFurnitureOwners(a.id);
  assert.ok(owners);
  assert.deepEqual([...owners!].sort(), ["userA", "userB"]);

  const missing = await getFurnitureOwners(9_999_999);
  assert.equal(missing, undefined);
});

test("saveFurnitureFromExisting with a provided thumbnail filename uses it as-is", async () => {
  makeFile(FURNITURE_PATH, "x.zip");
  makeFile(THUMBNAIL_PATH, "src.png", "src-bytes");
  makeFile(THUMBNAIL_PATH, "claimer-uploaded.png", "claimer-bytes");

  const a = await saveFurniture("userA", "x.zip", "room.zip", "src.png");
  const source = await getFurnitureById(a.id);
  assert.ok(source);

  const b = await saveFurnitureFromExisting(
    "userB",
    source!,
    "claimer-uploaded.png"
  );

  const bRow = await getFurnitureById(b.id);
  assert.equal(removeThumbnailURL(bRow!.thumbnail!), "claimer-uploaded.png");
  // No copy of the source thumbnail should have been made.
  const allThumbs = fs.readdirSync(THUMBNAIL_PATH);
  assert.deepEqual(allThumbs.sort(), ["claimer-uploaded.png", "src.png"]);
});

test("saveFurnitureFromExisting rolls back the clone when extraInTx throws", async () => {
  // P1 atomicity check: if consumeDuplicateToken (or any other extraInTx
  // callback) throws, neither the clone nor the audit row should exist
  // afterwards, and any thumbnail copy made for the failed clone should be
  // cleaned up from disk.
  makeFile(FURNITURE_PATH, "x.zip");
  makeFile(THUMBNAIL_PATH, "src.png", "src-bytes");
  const a = await saveFurniture("userA", "x.zip", "room.zip", "src.png");
  const source = await getFurnitureById(a.id);
  assert.ok(source);

  const beforeRows = await db
    .selectFrom("furniture")
    .select("id")
    .execute();
  const beforeThumbs = fs.readdirSync(THUMBNAIL_PATH).sort();

  await assert.rejects(
    () =>
      saveFurnitureFromExisting(
        "userB",
        source!,
        undefined,
        undefined,
        async () => {
          throw new Error("simulated token-consume failure");
        }
      ),
    /simulated token-consume failure/
  );

  const afterRows = await db
    .selectFrom("furniture")
    .select("id")
    .execute();
  const afterThumbs = fs.readdirSync(THUMBNAIL_PATH).sort();

  assert.deepEqual(
    afterRows.map((r) => r.id).sort(),
    beforeRows.map((r) => r.id).sort(),
    "no clone row left behind"
  );
  assert.deepEqual(
    afterThumbs,
    beforeThumbs,
    "no copied thumbnail left behind"
  );
});

test("commitFurniture flips a pending row from committed=0 to committed=1", async () => {
  makeFile(FURNITURE_PATH, "p.zip");
  const a = await saveFurniture(
    "userA",
    "p.zip",
    "room.zip",
    undefined,
    undefined,
    true
  );

  const before = await db
    .selectFrom("furniture")
    .select("committed")
    .where("id", "=", a.id)
    .executeTakeFirstOrThrow();
  assert.equal(Number(before.committed), 0);

  const ok = await commitFurniture(a.id, "userA");
  assert.equal(ok, true);

  const after = await db
    .selectFrom("furniture")
    .select("committed")
    .where("id", "=", a.id)
    .executeTakeFirstOrThrow();
  assert.equal(Number(after.committed), 1);
});

test("commitFurniture is idempotent for already-committed rows", async () => {
  makeFile(FURNITURE_PATH, "p.zip");
  const a = await saveFurniture("userA", "p.zip", "room.zip");

  // Default insert → committed=1 already.
  const ok = await commitFurniture(a.id, "userA");
  assert.equal(ok, true, "second commit on already-committed row succeeds");
  const ok2 = await commitFurniture(a.id, "userA");
  assert.equal(ok2, true);
});

test("commitFurniture rejects non-owners and missing ids", async () => {
  makeFile(FURNITURE_PATH, "p.zip");
  const a = await saveFurniture(
    "userA",
    "p.zip",
    "room.zip",
    undefined,
    undefined,
    true
  );

  const otherUser = await commitFurniture(a.id, "userB");
  assert.equal(otherUser, false);

  const stillPending = await db
    .selectFrom("furniture")
    .select("committed")
    .where("id", "=", a.id)
    .executeTakeFirstOrThrow();
  assert.equal(
    Number(stillPending.committed),
    0,
    "non-owner attempt did not flip the flag"
  );

  const missing = await commitFurniture(9_999_999, "userA");
  assert.equal(missing, false);
});

test("findUncommittedFurnitureOlderThan filters by committed flag and age", async () => {
  makeFile(FURNITURE_PATH, "old-pending.zip");
  makeFile(FURNITURE_PATH, "fresh-pending.zip");
  makeFile(FURNITURE_PATH, "old-committed.zip");

  const oldPending = await saveFurniture(
    "userA",
    "old-pending.zip",
    "room.zip",
    undefined,
    undefined,
    true
  );
  const freshPending = await saveFurniture(
    "userA",
    "fresh-pending.zip",
    "room.zip",
    undefined,
    undefined,
    true
  );
  const oldCommitted = await saveFurniture(
    "userA",
    "old-committed.zip",
    "room.zip"
  );

  // Backdate two of the three rows by 30 minutes. Use SQLite's
  // "YYYY-MM-DD HH:MM:SS" text format to compare correctly against
  // datetime('now', ...) inside the service.
  const past = new Date(Date.now() - 30 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  await db
    .updateTable("furniture")
    .set({ created_at: past as unknown as Date })
    .where("id", "in", [oldPending.id, oldCommitted.id])
    .execute();

  const candidates = await findUncommittedFurnitureOlderThan(10);

  assert.ok(
    candidates.includes(oldPending.id),
    "old pending row is a candidate"
  );
  assert.ok(
    !candidates.includes(freshPending.id),
    "fresh pending row excluded by age"
  );
  assert.ok(
    !candidates.includes(oldCommitted.id),
    "old committed row excluded by flag"
  );
  assert.equal(candidates.length, 1);
});

test("sweeping a pending row cleans up files and DB state via deleteFurnitureById", async () => {
  // End-to-end: simulate what `pnpm sweep --apply` does for a single row.
  // Verifies the integration between findUncommittedFurnitureOlderThan and
  // deleteFurnitureById that the sweeper script relies on.
  makeFile(FURNITURE_PATH, "doomed.zip");
  makeFile(THUMBNAIL_PATH, "doomed-thumb.png");
  const a = await saveFurniture(
    "userA",
    "doomed.zip",
    "room.zip",
    "doomed-thumb.png",
    undefined,
    true
  );

  const past = new Date(Date.now() - 30 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  await db
    .updateTable("furniture")
    .set({ created_at: past as unknown as Date })
    .where("id", "=", a.id)
    .execute();

  const ids = await findUncommittedFurnitureOlderThan(10);
  assert.deepEqual(ids, [a.id]);

  await deleteFurnitureById(a.id);

  assert.equal(exists(FURNITURE_PATH, "doomed.zip"), false);
  assert.equal(exists(THUMBNAIL_PATH, "doomed-thumb.png"), false);

  const stillThere = await getFurnitureById(a.id);
  assert.equal(stillThere, undefined);
});
