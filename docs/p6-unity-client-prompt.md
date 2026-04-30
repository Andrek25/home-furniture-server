# P6 — Two-phase commit for furniture uploads

## Background

The Render server and PlayFab share no transaction. Today an upload flow is:

1. Unity `POST /api/v1/furniture` → server creates a `furniture` row + writes
   the zip + thumbnail to disk and returns the new id.
2. Unity writes `RoomDesign_<SceneBaseID>` into PlayFab with that id as
   `OriginUrl`.

If step 2 fails (network drop, PlayFab outage, app crash, user closes the
app) the server keeps a row + files that no PlayFab room references —
permanently invisible furniture, no detection, no cleanup. This is **CP-1**
in `docs/orphan-zombie-analysis.md`.

P6 closes the gap by making the upload a **two-phase commit**:

- Phase 1 (existing): server creates the row in a *pending* state.
- Phase 2 (new): once Unity has confirmed the PlayFab write, it calls
  `POST /api/v1/furniture/:id/commit` and the row is promoted to
  *committed*.

A scheduled sweeper deletes pending rows older than a configurable
threshold (default 10 minutes).

## What is already done in this repo (server side)

Landed on `dev`. **No client changes were required** for backwards
compatibility — clients that don't send `pending=true` keep behaving
exactly as before (rows insert as committed and are never swept).

### Schema

Migration `1739436042235_furniture_committed` adds:

```
furniture.committed  INTEGER NOT NULL DEFAULT 1
```

Default `1` means "committed" — every existing row and every legacy
upload from a non-P6 client is unaffected.

### Service & controller

- `saveFurniture(..., pending: boolean = false)` — when `true`, the row
  inserts with `committed = 0`.
- `saveFurnitureFromExisting(..., pending: boolean = false)` — same shape
  for clones produced by `POST /api/v1/duplicate-furniture/:token`.
- `commitFurniture(furnitureId, ownerId)` — owner-gated `UPDATE`.
  Idempotent.
- `findUncommittedFurnitureOlderThan(minutes)` — sweeper input.

Both upload controllers (`postFurnitureController`,
`postDuplicateFurnitureController`) read a `pending` form field
(`"true"`/`"1"` → true, everything else → false) and forward it.

### Endpoint

```
POST /api/v1/furniture/:id/commit
Header: x-playfab-auth-token: <token>
Body:   (none)
```

Responses:
- `200` — committed (or already committed; idempotent).
- `400` — id is not a valid integer.
- `404` — id does not exist or caller does not own it.

### Sweeper

`scripts/sweep-uncommitted.ts`, exposed as `pnpm sweep`. Dry-run by
default. Run on a schedule (cron, Render scheduled job, or a `claude
schedule`-style background agent):

```
pnpm sweep                               # dry-run, default 10 min cutoff
pnpm sweep -- --apply                    # actually delete
pnpm sweep -- --apply --max-age-min=30   # 30 min cutoff
```

Sweeping uses `deleteFurnitureById` which already handles disk cleanup,
shared `local_name` reference counting, thumbnail removal, token
cleanup, and audit-row cascade. No new cleanup paths.

## What needs to happen in the Unity repo

### A. Send `pending=true` on `POST /api/v1/furniture`

Add a `pending` form field on the upload. In `FurnitureNetwork.cs`,
update both `UploadFurniture` overloads:

```csharp
form.AddField("pending", "true");
```

If the SceneBaseID is also being added per P3, the form ends up with
fields: `file`, `thumbnail` (optional), `scene_base_id`, `pending`.

The same applies to the claim/duplicate flow at
`POST /api/v1/duplicate-furniture/:token` — clones go through the
identical pending → commit lifecycle. Add `pending` to the form there
as well. (Per the orphan analysis, the failure mode is identical:
clone row + files exist on the server, PlayFab never gets the
`RoomDesign_<SceneBaseID>` write.)

### B. Call commit after the PlayFab save returns success

Sequence:

1. `POST /api/v1/furniture` (with `pending=true`) → response `{ id }`.
2. `UserAccountManager.SetUserData("RoomDesign_<SceneBaseID>", roomJson)`
   with `OriginUrl = id` — wait for the success callback.
3. `POST /api/v1/furniture/:id/commit` (no body, just the auth header).

If step 3 fails network-side, the row stays pending and the sweeper
removes it after the cutoff. The PlayFab key written in step 2 will
then 404 on next access — P5 self-heal (already shipped) deletes that
stale key. So a P6 commit failure degrades to a P5 self-heal scenario,
not a permanent zombie.

If step 2 fails, *do not call commit*. The row stays pending and gets
swept. The user will see "upload failed; please try again."

### C. Add a coroutine helper on `FurnitureNetwork.Network`

Mirror the pattern already used for the other endpoints:

```csharp
public IEnumerator CommitFurniture(int id, Action onCommitted = null, Action<string> errorCallback = null)
{
    using UnityWebRequest webRequest = UnityWebRequest.PostWwwForm(
        $"{apiUri}/api/v1/furniture/{id}/commit", string.Empty);
    webRequest.SetRequestHeader("x-playfab-auth-token", token);

    yield return webRequest.SendWebRequest();

    if (webRequest.result == UnityWebRequest.Result.Success)
        onCommitted?.Invoke();
    else
        errorCallback?.Invoke($"{webRequest.responseCode} {webRequest.error}");
}
```

(`PostWwwForm` is the modern replacement for the deprecated
`UnityWebRequest.Post(string, string)` that auto-set the form
content-type. If the project is locked to an older Unity API, use
whatever 0-byte POST form the rest of the codebase uses.)

### D. Wire the upload + commit chain at every existing upload site

There are at least two flows to update. Audit any caller of the upload
methods in the real Unity repo and slot in the commit step between
"PlayFab save succeeded" and "show success UI."

- `OnUploadDataPressed` / `StartZipUpload` → upload then PlayFab then
  commit.
- `DuplicateFurnitureWrapperRoutineAndAdd` → claim then PlayFab then
  commit.

### E. Decide on commit-retry behaviour (your call)

Pragmatic options when step 3 fails:

1. **Retry once, then give up.** Simple. If both attempts fail the
   sweeper handles it 10 minutes later. Tradeoff: room briefly looks
   broken until self-heal.
2. **Persist a "pending commit" entry in PlayerPrefs** and retry on
   next app launch. Safer, more code.
3. **No retry — just log.** Cheapest. Sweeper handles it.

The default sweeper cutoff is 10 minutes. If you go with retries on
launch (option 2), make sure the cutoff in `pnpm sweep --max-age-min=…`
is large enough that legitimate offline-then-relaunch flows aren't
swept before the retry runs.

### F. Do not weaken `pending=true` for shared-room duplicates

The duplicate / claim flow from another user's token also needs the
same protocol. A claimed furniture without a PlayFab key is the same
CP-1 orphan. Same form field, same commit step.

### G. Test plan

1. Happy path: upload with `pending=true`, observe row has
   `committed=0`, save PlayFab, hit commit, observe row has
   `committed=1`, sweeper leaves it alone.
2. PlayFab failure path: upload with `pending=true`, simulate a
   PlayFab timeout, never call commit, run `pnpm sweep --apply`
   after the cutoff, observe row + zip + thumbnail removed.
3. Commit failure path: upload, save PlayFab, simulate a network
   error on the commit call, run sweeper after cutoff, observe row
   removed AND the PlayFab key now points nowhere; open the room
   and confirm P5 self-heal deletes the PlayFab key.
4. Backwards compat: a build that doesn't send `pending=true`
   uploads exactly as before — row defaults to `committed=1`,
   sweeper never touches it.
5. Wrong owner: try to commit furniture id `X` with auth for
   another user; expect 404.

## Operational decisions you still need to make

- **Sweeper cadence.** Cron every hour? Run on server boot? Render
  scheduled job? `claude schedule` background agent? Recommendation:
  every hour with `--max-age-min=30`. Tighter cutoffs risk racing
  legitimate slow uploads on mobile networks.
- **Monitoring.** When the sweeper deletes anything, you want to
  know. Pipe the script's output to a log file or wire it through
  `notify-send` / Slack. (P7 — the cross-system audit log — would
  give you this for free; consider doing it after this lands.)
- **Cutoff lower bound.** Whatever you pick, make sure it's well
  above the slowest realistic round-trip for an upload + PlayFab
  write + commit on a phone over a flaky connection. Recommend ≥
  10 minutes; never below 5.

## When this lands

Mark P6 closed in `docs/orphan-zombie-analysis.md`. CP-1 stays listed
but downgrades to "transient; sweeper auto-recovers within
`--max-age-min`." CP-5 (orphan tokens) is **not** addressed by this
PR — token orphans are far cheaper (a row, no file, no
cross-platform invisibility) so they were left out of scope.
