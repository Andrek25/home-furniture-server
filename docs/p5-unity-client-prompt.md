# P5 — Self-healing 404 in the Unity client

## Background

The Render server stores furniture rows; PlayFab stores per-user
`RoomDesign_<SceneBaseID>` keys whose `OriginUrl` field is the stringified
`furniture.id`. The two systems have no shared transaction, so server-side
deletion can succeed while the corresponding `RemoveUserData` call fails —
the PlayFab key persists pointing to a row that no longer exists. Loading
that key produces a 404 forever (CP-2 in
`docs/orphan-zombie-analysis.md`).

P5 closes this over time by making the **Unity client** delete the stale
PlayFab key whenever a furniture download returns 404.

## What is already done in this repo's `examples/` snapshot

These two changes show the intended pattern. They need to be ported to the
real Unity repo and applied at every load site.

### 1. New API on `FurnitureNetwork.Network`

`examples/FurnitureNetwork.cs` now exposes:

```csharp
public IEnumerator CheckFurnitureExists(
    string id,
    Action onFound = null,
    Action onMissing = null,        // 404 — safe to delete the PlayFab key
    Action<string> onError = null   // any other failure — DO NOT delete
)
```

Implemented as `HEAD /api/v1/furniture/{id}`. The three callbacks are
mutually exclusive. Only `onMissing` is a true 404 — every other failure
(network drop, 401, 5xx) goes to `onError` and must not trigger PlayFab
cleanup, otherwise transient failures would silently destroy users' rooms.

### 2. New overload on `AssetViewerBase`

`examples/AssetViewerBase.cs` now has:

```csharp
protected void LoadModelFromFileWithIdFromPrivateServer(string id, string sceneBaseId)
```

If `sceneBaseId` is null/empty it delegates to the existing single-arg
overload (no self-heal possible without the key name). Otherwise it runs
`CheckFurnitureExists` first and, on 404, calls
`UserAccountManager.Instance.RemoveUserData("RoomDesign_" + sceneBaseId)`
and aborts the load with the loading spinner stopped.

The one in-tree call site at the top of `LoadModelFromURLWithDialogValues`
was migrated to pass `SessionInfo.RoomData?.RoomWrapper?.SceneBaseID`.

## What still needs to happen in the Unity repo

### A. Migrate every load site that has a `SceneBaseID` in scope

Switch single-arg calls to the two-arg overload wherever the load was
triggered by reading a `RoomDesign_<SceneBaseID>` key out of PlayFab.
Search for all callers of:

```
LoadModelFromFileWithIdFromPrivateServer(
GenerateDownloadRequest(
AssetDownloader.LoadModelFromUri(  // any flow that targets /api/v1/furniture/{id}
```

For each match, decide:

- **Has `SceneBaseID` available?** Use the new two-arg overload.
- **Triggered by a fresh upload (no PlayFab key exists yet)?** Leave the
  single-arg call alone — there is nothing to self-heal.
- **Multiplayer / other-user's room?** Do **not** delete the PlayFab key.
  Self-heal only applies to the *current user's own* `RoomDesign_*` keys,
  because `RemoveUserData` only operates on the caller's PlayFab profile.
  If you can detect "this is not my room", skip the self-heal and just
  surface an error.

Known load sites to audit (paths are relative to the Unity repo, names
match the snapshot here):

- `AssetViewerBase.LoadModelFromURLWithDialogValues` — already migrated
  in the snapshot; verify the real-repo version matches.
- `AssetViewer.cs` — search for any direct calls to
  `LoadModelFromFileWithIdFromPrivateServer` or to
  `AssetDownloader.LoadModelFromUri` with a `/api/v1/furniture/{id}` URL.
- `RoomSavedManager.cs` — the room-list "open" handler eventually loads
  the model. Inspect every path where a `furnitureWrapper` from
  `MyHomesListWrappers` / `InvitedListWrappers` flows into a load.
- Any download path in the WebGL JS bridge that bypasses
  `FurnitureNetwork`.

### B. Decide on the user-facing UX for 404 self-heal

When a stale key is auto-deleted, the user's experience is "I clicked a
room and it vanished from the list." Choose one of:

1. Toast: "This room is no longer available and has been removed from
   your list." Then refresh the room list UI.
2. Silent + refresh — log only, just refresh the list.
3. Confirm dialog before deletion — adds a click but avoids surprise.

The snapshot picks (2) by default (just `Debug.LogWarning` +
`SetLoading(false)`). Pick whichever fits the product and update the
`onMissing` body accordingly.

### C. Make sure the room-list UI refreshes after self-heal

`RemoveUserData` already calls `GetAllUserDataKeys` on success, which
fires `OnUserDataRetrieved`. Confirm the room-list UI subscribes to that
event (or to whatever rebuilds `MyHomesListWrappers`) and does a full
rebuild rather than an incremental add — otherwise the deleted key may
linger in the in-memory list.

In the snapshot, `RoomSavedManager.MyHomesListWrappers.Remove(...)` is
called manually elsewhere in the delete flow. After self-heal, the same
removal should happen — either driven by the `GetAllUserDataKeys`
callback or explicitly inside `onMissing`.

### D. Multiplayer / shared-room cases

If your app loads other users' rooms (read-only), make sure those load
paths use the **single-arg** overload, not the new one. Deleting another
user's `RoomDesign_*` key from your own PlayFab profile is a no-op (the
key isn't yours), but passing their `SceneBaseID` and accidentally
treating it as your own would still corrupt your local cache. Keep the
two paths visually distinct.

### E. Test plan

1. Upload a room from device A.
2. Manually delete the row from the Render DB (e.g. via
   `pnpm tsx scripts/...` or direct SQL — leave the PlayFab key intact).
3. Restart the app, open the room from the list.
4. Expect: log message about removing stale key, room disappears from
   list, no infinite spinner.

Negative test:

1. Upload a room.
2. Disconnect from the internet.
3. Open the room.
4. Expect: error surfaced, **PlayFab key still present** when
   reconnected. (Confirms transient failure does not trigger cleanup.)

## Server side

No server changes are needed. Express auto-handles `HEAD` for any `GET`
route, so `HEAD /api/v1/furniture/{id}` works against the existing
endpoint. The auth middleware applies the same way.

## When this lands

Mark P5 closed in `docs/orphan-zombie-analysis.md`. CP-2 stays listed but
the user-visible cost shrinks to "first load after deletion fails once,
then the entry self-cleans." That is acceptable; no further work
required.
