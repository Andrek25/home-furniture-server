# Code Review Plan — orphan/zombie campaign

A handoff for a junior developer to review the recent body of work on the
`dev` branch. Self-contained: starts with what the project does, then what
changed, then a step-by-step review walkthrough.

## What the project is

A small Express + SQLite (Kysely) HTTP server that backs a Unity client.
PlayFab handles users, room JSON, and sharing tokens; this server stores
the heavy assets (3D model zips + thumbnails) and the metadata around
them. PlayFab and this server have **no shared transaction** — that
asymmetry is the source of most of the work below.

### Existing product features (already shipped)

These existed before the orphan/zombie campaign and are referenced by
the work below.

- **Furniture upload / download / list / delete** — `POST/GET/DELETE
  /api/v1/furniture[/:id]`, `GET /api/v1/furnitures`. Multipart upload
  via multer; zip stored under `FURNITURE_PATH`.
- **Per-row thumbnails** — `thumbnail` column points at a unique image
  under `THUMBNAIL_PATH`, served as static files at `/thumbnails/...`.
  Thumbnails are never shared between rows (commit 50b50fd).
- **Replace file / thumbnail** — `POST /api/v1/furniture/:id/file`,
  `POST /api/v1/furniture/:id/thumbnail`. POST instead of PATCH because
  Unity's `UnityWebRequest` doesn't support PATCH.
- **Multi-owner model** — `furniture_owner` table maps
  `(furniture_id, owner_id)`. `getFurnitureById(id, { ownerId })` gates
  by ownership when needed.
- **Shared zip files via reference counting** — when a furniture is
  duplicated (claim flow), the new row reuses the source's `local_name`.
  `countFurnitureSharingLocalName` ensures the file is only deleted from
  disk once no row references it (commit 2ba7438).
- **Duplicate / sharing tokens** — owner generates a token via
  `GET /api/v1/duplicate-furniture/:id`, anyone with the token claims a
  copy via `POST /api/v1/duplicate-furniture/:token`. Tokens are
  intentionally non-expiring and reusable (commit c4b9d96).
- **PlayFab auth middleware** — every route validates
  `X-PlayFab-Auth-Token` and attaches `req.playfab.id`.
- **Migrations + verify script** — Kysely-driven, run via `pnpm migrate`.
  `pnpm tsx scripts/verify.ts` exercises the file/DB invariants
  end-to-end.

## What this work adds

Driven by `docs/orphan-zombie-analysis.md`. The campaign closes specific
DB-internal and cross-platform (PlayFab ↔ Render) failure modes that
were producing orphan files, zombie rows, and lossy audit data.

### DB-internal fixes

| ID | What | Commit |
|----|------|--------|
| P0 | `replaceFurnitureThumbnail` is now transactional (rename → UPDATE → delete old; cleans up the renamed file if the UPDATE fails). | 1745157 |
| P1 | `consumeDuplicateToken` runs inside the same transaction as `saveFurnitureFromExisting`, closing the retry-creates-duplicates abuse vector. | 1745157 |
| #6 | `postFurnitureController` validates the required `file` field up front and responds 400 when multer's `fileFilter` rejected the upload (was silently hanging). | 1745157 |
| #3 | New `duplicate_token_claim` table — append-only audit log. Each claim adds a row recording `claimed_by`, `claimed_at`, and the cloned `furniture_id`. Legacy `consumed_by`/`consumed_at` columns stay for backward compat. Cascade cleanup on furniture delete. | adf5829 |

### Cross-platform fixes

| ID | What | Commit |
|----|------|--------|
| P3 | New `furniture.scene_base_id` column + index. Both upload controllers persist it; nullable so older Unity builds aren't broken. Unlocks future PlayFab ↔ Render reconciliation. | 1745157 |
| P4 | `scripts/reconcile.ts` (`pnpm reconcile`) reports drift in both directions — orphan disk files (deletable with `--apply`) and zombie rows (report-only; may still be referenced by PlayFab). | 1e0e72b |
| P5 | Self-heal helpers in `examples/` (HEAD-based existence probe + two-arg `LoadModelFromFileWithIdFromPrivateServer`). When a download 404s, the stale `RoomDesign_<SceneBaseID>` PlayFab key is deleted. Server-side: nothing to change (Express auto-handles HEAD on GET). Unity migration brief in `docs/p5-unity-client-prompt.md`. | b1392cf |
| P6 | Two-phase commit on uploads. New `furniture.committed` column (default 1 for backward compat), `pending=true` form field on the two upload controllers, new `POST /api/v1/furniture/:id/commit` endpoint, sweeper script `scripts/sweep-uncommitted.ts` (`pnpm sweep`). Unity migration brief in `docs/p6-unity-client-prompt.md`. **Server side is uncommitted at the time of writing — review the working tree, not just `git log`.** | uncommitted |

### Tests

`scripts/verify.ts` grew from 7 tests (~22 assertions) to 11 tests (43
assertions). New coverage:

- Test 8 — append-only audit under sequential claims.
- Test 9 — cascade cleanup of audit rows on source-furniture delete.
- Test 10 — pending upload + commit + idempotence + non-owner reject.
- Test 11 — sweeper filters by `committed=0` AND age cutoff; preserves
  committed rows and fresh pending rows.

### Documentation

- `docs/orphan-zombie-analysis.md` — the source of truth. P0–P7 priority
  list with each item annotated as done or open.
- `docs/p5-unity-client-prompt.md` — porting brief for the Unity team
  (self-heal pattern).
- `docs/p6-unity-client-prompt.md` — porting brief for the Unity team
  (two-phase commit pattern).

## Review walkthrough for a junior developer

Read in this order. The arrows mean "after reading X, you have the
context for Y." Don't skip ahead — the campaign was incremental and
later changes lean on earlier ones.

### 1. Read the architecture context first (15 min)

- `docs/orphan-zombie-analysis.md` start to finish. The "Architecture
  context" section explains why the server exists alongside PlayFab and
  why no transaction spans them. The "What's protected on `dev`" list
  is the invariants you'll see enforced in the code.
- `src/db/tables/*.ts` — read all four table files. Pay attention to the
  docblocks; they describe the invariants (shared `local_name`, unique
  thumbnails, append-only audit, two-phase commit flag).

### 2. Walk the upload happy path (20 min)

Follow a single `POST /api/v1/furniture` request from HTTP into the DB:

- `src/routes/furniture.ts` — see the route table.
- `src/middlewares/playfab.ts` — auth middleware.
- `src/config/multer.ts` — where the disk file lands.
- `src/controllers/furniture.ts:postFurnitureController` — input
  parsing, the new `pending` flag, error cleanup.
- `src/services/furniture.ts:saveFurniture` — the transaction.

Question to ask yourself: *if any step here throws, what files are left
on disk and what rows are left in the DB?* Confirm the answer matches
the comments.

### 3. Walk the duplicate / claim path (15 min)

This is the most subtle flow because it touches three tables in one
transaction.

- `src/controllers/furniture.ts:postDuplicateFurnitureController` — the
  `extraInTx` callback at the bottom is the key bit.
- `src/services/furniture.ts:saveFurnitureFromExisting` — note how
  `extraInTx` receives the new `furnitureId` so the audit row can record
  it.
- `src/services/duplicate-token.ts:consumeDuplicateToken` — both writes
  (audit insert + legacy column update) on the caller's executor.

Question: *if `consumeDuplicateToken` throws, does the cloned furniture
get rolled back?* (Yes — same transaction.) *If it commits, can the same
token be claimed again?* (Yes — tokens are intentionally reusable; the
audit log just gets another row.)

### 4. Walk the delete path (10 min)

- `src/services/furniture.ts:deleteFurnitureById` — note the explicit
  `duplicate_token_claim` and `duplicate_token` deletes inside the
  transaction. SQLite's foreign-key cascades are off (no
  `PRAGMA foreign_keys=ON`), so the explicit deletes are load-bearing,
  not belt-and-suspenders.
- After the transaction, the shared-file accounting and disk cleanup.

Question: *what happens if two `DELETE` requests for the same id race?*
(Both transactions try to `DELETE FROM furniture WHERE id=...`; only
one succeeds. The other gets `furniture = undefined` and skips file
cleanup. No double-delete on disk.)

### 5. Read the two scripts (15 min)

- `scripts/reconcile.ts` — disk vs DB drift. Note the asymmetry:
  orphan files are deletable, zombie rows are report-only because the
  `furniture.id` may still be live in a PlayFab `OriginUrl`.
- `scripts/sweep-uncommitted.ts` — pending uploads past the age cutoff.
  Reuses `deleteFurnitureById`, so all the cleanup logic from §4
  applies automatically.

Question: *what's the worst that happens if you run
`pnpm reconcile -- --apply` on a fresh post-deploy environment with the
ephemeral disk wiped?* (Nothing on disk to delete; the DB shows every
row as a zombie, which is correctly report-only.)

### 6. Read the verify script (10 min)

- `scripts/verify.ts`. Each test is a self-contained scenario. Read
  tests 8–11 closely — those are the new ones. Note how test 11
  backdates `created_at` using SQLite's text format (`YYYY-MM-DD
  HH:MM:SS`, not ISO 8601 with `T`) to match `datetime('now', ...)`.

Run it: `pnpm tsx --env-file=.env scripts/verify.ts`. All 43 assertions
should pass.

### 7. Read the Unity briefs (15 min)

- `docs/p5-unity-client-prompt.md` — the in-tree changes are in
  `examples/FurnitureNetwork.cs` (HEAD probe) and
  `examples/AssetViewerBase.cs` (the two-arg overload + one migrated
  call site). The doc lists every other call site that needs the same
  treatment in the real Unity repo.
- `docs/p6-unity-client-prompt.md` — the upload/commit chain Unity
  needs to adopt. Pay attention to §F (duplicate-flow also needs the
  protocol) and §G (test plan).

### 8. Things to question or push back on

These are intentional choices that a careful reviewer should ask
about; don't accept them silently.

- **`PRAGMA foreign_keys=ON` is off.** The cascades in the schema are
  decorative without it. We compensate with explicit deletes. Should
  it just be on? (Tradeoff: enabling it might surface latent ordering
  bugs in unrelated code.)
- **`expires` and `consumed_by` / `consumed_at` columns are
  vestigial.** We could drop them in a follow-up but didn't to keep
  the migration small and reversible.
- **CP-5 (orphan tokens) was deferred.** Token rows have no file and
  don't make rooms invisible, so they were left out of P6. If
  forensic data later shows lots of them piling up, revisit.
- **Sweeper has no scheduler.** It's a script, not a cron. The Unity
  brief recommends "every hour with `--max-age-min=30`" but nobody
  has wired that up yet. Should it run on server boot? Render
  scheduled job? Background agent?
- **The `pending` form field is opt-in for backward compatibility.**
  This means CP-1 stays open until Unity ships the new client. Worth
  flagging that the server-side P6 work is dormant until then.
- **`examples/` is a snapshot of the real Unity code, not the source
  of truth.** Changes there don't affect the running app — they're
  reference material for the porting briefs. A reviewer should
  confirm with the project owner whether the snapshot is meant to
  stay in sync.

### 9. Smoke test the running server (10 min)

```
pnpm migrate                # apply all migrations including the new ones
pnpm tsx --env-file=.env scripts/verify.ts   # 43 assertions pass
pnpm reconcile              # dry-run, expect "0 0 0 0" on a clean DB
pnpm sweep                  # dry-run, expect "0 candidates" on a clean DB
pnpm dev                    # start the server and curl a few endpoints
```

### What "approved" looks like

- All 43 verify assertions pass on a fresh checkout.
- Both scripts run cleanly with no orphans/zombies/pending rows.
- Every priority item in `docs/orphan-zombie-analysis.md` marked
  "done" matches actual code (don't trust the doc; verify).
- The Unity briefs are coherent enough that someone with no context
  could open the Unity repo and start porting.

### What would block approval

- Any verify test fails.
- A code path you can construct (in your head) that produces an
  orphan file or zombie row that the analysis claims is closed.
- A Unity brief that omits a call site visible in `examples/`.
- The uncommitted P6 work — it should be committed before review
  ends, otherwise the reviewer is reading "this branch" but the
  branch state in CI may not match.
