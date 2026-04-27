# Orphan / Zombie Data Analysis — `dev` branch

Snapshot of the analysis performed on the `dev` branch. Picks up after the
shared-model reference-counting work landed (commits up to `f25389d`).

## Architecture context

Two systems hold related state:

- **PlayFab** — stores `RoomDesign_<SceneBaseID>` per user as a JSON
  `RoomJsonWrapper`. Wrapper holds `OriginUrl` (stringified `furniture.id`),
  `SceneThumbnail` (small JPG inline), and `Token` (sharing).
- **Render DB** — `furniture` (3D model + thumbnail), `furniture_owner`
  (PlayFab IDs), `duplicate_token` (sharing).

There is no shared transaction. Cross-system ops are two writes that can fail
independently. Server has no reverse index back to PlayFab.

## What's protected on `dev`

Verified by `scripts/verify.ts` (7 invariants):

- Reference-counted shared `local_name` — file only deleted when no row
  references it (`countFurnitureSharingLocalName`).
- `saveFurniture` is atomic — `furniture` + `furniture_owner` in one tx.
- `deleteFurnitureById` is atomic — furniture delete + token purge in one tx.
- `saveFurnitureFromExisting` cleans up copied thumbnail on insert failure.
- Multer cleanup on every controller error path.
- Ownership checks on `patchFurnitureFile`, `patchFurnitureThumbnail`,
  `getDuplicateFurniture`.
- Unique constraints on `furniture_owner(furniture_id, owner_id)` and
  `duplicate_token.token`.
- FK with `ON DELETE CASCADE` on `duplicate_token.furniture_id`.

## DB-internal risks STILL active

### 1. `replaceFurnitureThumbnail` is not transactional
`services/furniture.ts:424-476`. Order is `unlink old → rename new → UPDATE
DB`. A failure or crash after the rename and before the UPDATE leaves a zombie
row (DB references missing old file) and an orphan file (new file with no
reference). Only mutation that doesn't follow the "tx first, file cleanup
after" pattern.

### 2. Token consume is outside the save tx
`controllers/furniture.ts:418-425`. `saveFurnitureFromExisting` (its own tx)
runs, then `consumeDuplicateToken` is a separate UPDATE. Crash between → new
furniture exists, token unconsumed. Same user can re-claim and accumulate
duplicate rooms; no unique constraint prevents this because each call creates
a fresh `furniture.id`. Abuse vector for uncontrolled growth.

### 3. `consumeDuplicateToken` is lossy
Schema has only one `consumed_by`/`consumed_at` pair, but tokens are reusable
(`duplicate-token.ts:21`). Each new claim overwrites the prior audit fields.
Cannot reconstruct full claim history.

### 4. `expires` not enforced
`getDuplicateToken` returns the row regardless of `expires`. Comment in
`duplicate-token.ts:42` acknowledges this. Old tokens work indefinitely.

### 5. Repeat-claim collision
A user can claim the same token an unbounded number of times if `consume`
fails. With #2, a network blip during consume → retry → two `furniture` rows
for the same source.

### 6. `postFurnitureController` silent hang
`controllers/furniture.ts:97-125`. Body gated on `if (req.files)`. If multer
accepts zero files, no response is ever sent. Client times out, may retry,
creating duplicate uploads.

### 7. No disk ↔ DB drift detector
Per-op cleanup is correct, but historical orphans from pre-fix bugs may sit
on disk. No scheduled scan compares `FURNITURE_PATH`/`THUMBNAIL_PATH` against
the DB.

## Cross-platform (PlayFab ↔ Render) risks STILL active

These are architectural — server can't solve them alone.

### CP-1. Server upload OK, PlayFab save fails
`OnUploadDataPressed`, `DuplicateFurnitureWrapperRoutineAndAdd`. Furniture
row + files exist on server, no PlayFab room references them. Permanently
invisible.

### CP-2. Server delete OK, PlayFab `RemoveUserData` fails
`RemoveHomeDataEntryRoutine`. Server-side delete first (correct order). If
PlayFab call fails afterward, PlayFab key persists pointing to deleted
furniture. Loading → 404. Zombie room in PlayFab.

### CP-3. Thumbnail update order
`OnUploadDataPressed` saves PlayFab JSON, then posts new thumbnail to server.
PlayFab updated, server thumbnail stale on failure. Visual inconsistency.

### CP-4. PlayFab account deletion
Server has no signal. `furniture_owner` rows persist on server.

### CP-5. Token created, PlayFab save fails
`AllowShareLinkRoutine`. Token row exists with no client knowing. Combined
with #4, accumulates forever.

### CP-6. `Token` field overwritten in PlayFab
Each `AllowShareLinkRoutine` overwrites `Token` in PlayFab. Old token still
valid on server. Token zombies untracked.

### CP-7. No `scene_base_id` on `furniture`
PlayFab → server is the only direction with a reference. Server cannot
answer "is this furniture still referenced by any PlayFab room?" without
admin-API enumeration.

## Detection queries available today

```sql
-- Furniture without owners (cascade should prevent; expect 0)
SELECT f.id, f.local_name, f.thumbnail, f.created_at
FROM furniture f
LEFT JOIN furniture_owner fo ON fo.furniture_id = f.id
WHERE fo.id IS NULL;

-- Tokens past expiry
SELECT id, token, furniture_id, owner_id, expires, consumed_by
FROM duplicate_token
WHERE expires < strftime('%s','now') * 1000;

-- Unconsumed expired tokens (cleanup candidates)
SELECT id, token, furniture_id, owner_id
FROM duplicate_token
WHERE consumed_at IS NULL
  AND expires < strftime('%s','now') * 1000;

-- Sharing distribution (who shares the most-replicated model)
SELECT local_name, COUNT(*) AS sharers
FROM furniture
GROUP BY local_name
ORDER BY sharers DESC;

-- Possibly abandoned (single-owner, old)
SELECT f.id, f.local_name, f.created_at, fo.owner_id
FROM furniture f
JOIN furniture_owner fo ON fo.furniture_id = f.id
WHERE f.created_at < datetime('now', '-30 days')
GROUP BY f.id
HAVING COUNT(fo.owner_id) = 1;
```

Cannot detect with SQL alone:

- Orphan files on disk → script to scan + cross-reference DB.
- DB rows pointing to missing files → `fs.existsSync` per row.
- Cross-platform orphans → PlayFab admin API enumeration required.

## Recommendations (priority order)

- **P0** — Make `replaceFurnitureThumbnail` transactional (UPDATE first, file
  ops after commit). Closes #1. ~30 min.
- **P1** — Bundle `consumeDuplicateToken` into the same tx as
  `saveFurnitureFromExisting`. Closes #2 and #5. ~1 hr.
- **P2** — Enforce `expires` in `getDuplicateToken`; add cleanup cron. ~30 min.
- **P3** — Add `scene_base_id` and `playfab_owner_id` columns on `furniture`.
  Unlocks all cross-platform reconciliation. ~2 hrs incl. migration.
- **P4** — Disk-scan reconciliation script (log-only first, then enable
  deletion). ~2 hrs.
- **P5** — Self-healing 404 on Unity client: delete PlayFab key on download
  404. Closes CP-2 over time. Client-side.
- **P6** — Pending/committed flag for two-phase commit on uploads. Closes
  CP-1 and CP-5. ~3 hrs.
- **P7** — Audit log table for every cross-system op. ~2 hrs.

Note on the duplicate-on-claim model: the original "invited user gets zombie
room when owner deletes" scenario is not a problem because each claimer gets
their own `furniture` row + own thumbnail. The shared-file deletion bug that
*was* a problem is resolved by the reference counting in this branch.

## Render deployment notes

- Free tier disk is ephemeral — uploads wiped on every redeploy/restart.
- `/var/...` paths are not writable; use `/opt/render/project/src/data` (or
  a paid Render Disk mount path).
- Build: `npm install -g pnpm && pnpm install`. Start: `pnpm start`.
- `tsx` is in devDependencies — must install all deps (no `--prod` flag).
- Required env vars: `NODE_ENV`, `PORT`, `PLAYFAB_TITLE_ID`,
  `PLAYFAB_DEVELOPER_SECRET_KEY`, `DISK_ROOT_PATH`, `DUPLICATE_TOKEN_EXPIRY`.
