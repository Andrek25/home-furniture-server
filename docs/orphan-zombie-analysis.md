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

### 1. ~~`replaceFurnitureThumbnail` is not transactional~~ — fixed
`services/furniture.ts:replaceFurnitureThumbnail`. Reordered to "rename new
→ UPDATE DB → delete old (best-effort)". DB-update failure cleans up the
just-renamed file before rethrowing. Zombie-row case eliminated.

### 2. ~~Token consume is outside the save tx~~ — fixed
`saveFurnitureFromExisting` now accepts an `extraInTx` callback;
`controllers/furniture.ts:postDuplicateFurnitureController` passes a closure
that calls `consumeDuplicateToken(..., trx)` inside the same transaction as
the clone insert. Closes the retry-creates-duplicates abuse vector.

### 3. `consumeDuplicateToken` is lossy
Schema has only one `consumed_by`/`consumed_at` pair, but tokens are reusable
(`duplicate-token.ts:21`). Each new claim overwrites the prior audit fields.
Cannot reconstruct full claim history.

### 4. ~~`expires` not enforced~~ — intentional
Tokens are intentionally persistent and never expire. The `expires` column is
vestigial; do not propose enforcement or a cleanup cron.

### 6. ~~`postFurnitureController` silent hang~~ — fixed
`controllers/furniture.ts:postFurnitureController`. Now normalises
`req.files` and the per-field arrays, validates the required `file` field up
front, and responds `400 "file required"` (cleaning up any orphan thumbnail)
when multer's `fileFilter` rejected the upload.

### 7. ~~No disk ↔ DB drift detector~~ — fixed
`scripts/reconcile.ts` (run via `pnpm reconcile`) reports drift in both
directions. Default mode is dry-run; `--apply` deletes orphan files only.
Zombie rows are report-only — a `furniture.id` may still be referenced by a
PlayFab room JSON, so silent DB deletion would make the 404 permanent.

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
`AllowShareLinkRoutine`. Token row exists with no client knowing. Since
tokens never expire (intentional, see #4), these accumulate forever.

### CP-6. `Token` field overwritten in PlayFab
Each `AllowShareLinkRoutine` overwrites `Token` in PlayFab. Old token still
valid on server. Token zombies untracked.

### CP-7. ~~No `scene_base_id` on `furniture`~~ — partially addressed
Column added (migration `1739436042233_furniture_scene_base_id`). Both upload
controllers read `req.body.scene_base_id` from multipart form data and
persist it. Existing rows and rows from older Unity builds remain NULL and
are excluded from any cross-platform reconciliation. Reconciliation logic
itself is not yet built — see P4.

## Detection queries available today

```sql
-- Furniture without owners (cascade should prevent; expect 0)
SELECT f.id, f.local_name, f.thumbnail, f.created_at
FROM furniture f
LEFT JOIN furniture_owner fo ON fo.furniture_id = f.id
WHERE fo.id IS NULL;

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

- ~~**P0** — Make `replaceFurnitureThumbnail` transactional. Closes #1.~~ Done.
- ~~**P1** — Bundle `consumeDuplicateToken` into the same tx as
  `saveFurnitureFromExisting`. Closes #2 and the retry-duplicate vector.~~ Done.
- ~~**P2** — Enforce `expires`. Skipped: tokens are intentionally non-expiring.~~
- ~~**P3** — Add `scene_base_id` to `furniture`. Unlocks cross-platform
  reconciliation.~~ Done. (`playfab_owner_id` skipped as redundant with
  `furniture_owner.owner_id`.) Unity client must start sending
  `scene_base_id` as a form field on `POST /api/v1/furniture` and
  `POST /api/v1/duplicate-furniture/:token` for new rows to be reconcilable.
- ~~**P4** — Disk-scan reconciliation script (log-only first, then enable
  deletion).~~ Done. `scripts/reconcile.ts` (dry-run by default,
  `--apply` deletes orphan files; zombie rows reported only). Closes #7.
- **P5** — Self-healing 404 on Unity client: delete PlayFab key on download
  404. Closes CP-2 over time. Pattern + helpers landed in `examples/`
  (`FurnitureNetwork.CheckFurnitureExists`, two-arg
  `LoadModelFromFileWithIdFromPrivateServer`); migration brief for the
  full Unity repo is in `docs/p5-unity-client-prompt.md`. No server
  changes — Express auto-handles `HEAD` on the existing GET route.
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
