#if UNITY_EDITOR
using System;
using System.Collections;
using System.Text;
using Sirenix.OdinInspector;
using UnityEngine;
using UnityEngine.Networking;

namespace FurnitureNetwork.Admin
{
    /// <summary>
    /// Editor-only MonoBehaviour that calls every /admin/* endpoint via Inspector
    /// buttons (Odin Inspector). Intended for live debugging/migrations against
    /// a running server. Auth uses the admin account's PlayFab session ticket
    /// (default: ivrishostapp / DAB674F3C666368C). Drop this on any GameObject in
    /// an editor scene, paste the apiUri + token, and click buttons.
    ///
    /// Wrapped in #if UNITY_EDITOR so it never ships in player builds.
    /// </summary>
    [AddComponentMenu("Furniture/Admin Tools Runner (Editor Only)")]
    public class AdminToolsRunner : MonoBehaviour
    {
        // ---- Connection ----
        [BoxGroup("Connection")]
        [Tooltip("Base server URL, e.g. https://furniture.example.com")]
        public string apiUri = "http://localhost:4000";

        [BoxGroup("Connection")]
        [Tooltip("PlayFab session ticket of the admin account (ivrishostapp).")]
        [MultiLineProperty(4)]
        public string adminToken = "";

        // ---- Inputs reused across buttons ----
        [BoxGroup("Inputs")] public int furnitureId;
        [BoxGroup("Inputs")] public string playerId = "";

        // ---- Backfill inputs ----
        [BoxGroup("Backfill")] public bool backfillAll;
        [BoxGroup("Backfill")] public string[] backfillPlayerIds;
        [BoxGroup("Backfill")] public string[] backfillTokens;
        [BoxGroup("Backfill")] public bool backfillApply;

        // ---- Apply flags for destructive ops ----
        [BoxGroup("Apply Flags")] public bool reconcileApply;
        [BoxGroup("Apply Flags")] public bool dedupeApply;

        // ---- Last response (read-only display) ----
        [BoxGroup("Last Response")]
        [MultiLineProperty(20)]
        [ReadOnly]
        public string lastResponse = "";

        // ---- Read-only endpoints ----

        [Button("GET /admin/stats")] [BoxGroup("Read-Only")]
        private void GetStats() => Send("GET", "/admin/stats");

        [Button("GET /admin/furniture")] [BoxGroup("Read-Only")]
        private void GetAllFurniture() => Send("GET", "/admin/furniture");

        [Button("GET /admin/furniture/orphaned")] [BoxGroup("Read-Only")]
        private void GetOrphaned() => Send("GET", "/admin/furniture/orphaned");

        [Button("GET /admin/uncommitted")] [BoxGroup("Read-Only")]
        private void GetUncommitted() => Send("GET", "/admin/uncommitted");

        [Button("GET /admin/duplicate-tokens")] [BoxGroup("Read-Only")]
        private void GetDuplicateTokens() => Send("GET", "/admin/duplicate-tokens");

        [Button("GET /admin/reconcile (dry-run)")] [BoxGroup("Read-Only")]
        private void GetReconcile() => Send("GET", "/admin/reconcile");

        [Button("GET /admin/zombies (slow!)")] [BoxGroup("Read-Only")]
        private void GetZombies() => Send("GET", "/admin/zombies");

        [Button("GET /admin/playfab-duplicates (slow!)")] [BoxGroup("Read-Only")]
        private void GetPlayfabDuplicates() => Send("GET", "/admin/playfab-duplicates");

        [Button("GET /admin/players/:playerId")] [BoxGroup("Read-Only")]
        private void GetPlayerFurniture()
        {
            if (string.IsNullOrEmpty(playerId)) { Log("playerId is required"); return; }
            Send("GET", $"/admin/players/{playerId}");
        }

        // ---- Mutating furniture endpoints ----

        [Button("DELETE /admin/furniture/:id (force-delete)")] [BoxGroup("Mutate")]
        private void DeleteFurniture()
        {
            Send("DELETE", $"/admin/furniture/{furnitureId}");
        }

        [Button("POST /admin/furniture/:id/assign-owner")] [BoxGroup("Mutate")]
        private void AssignOwner()
        {
            if (string.IsNullOrEmpty(playerId)) { Log("playerId is required"); return; }
            Send("POST", $"/admin/furniture/{furnitureId}/assign-owner",
                $"{{\"playerId\":\"{Escape(playerId)}\"}}");
        }

        [Button("DELETE /admin/furniture/:id/owner/:playerId")] [BoxGroup("Mutate")]
        private void RemoveOwner()
        {
            if (string.IsNullOrEmpty(playerId)) { Log("playerId is required"); return; }
            Send("DELETE", $"/admin/furniture/{furnitureId}/owner/{playerId}");
        }

        // ---- Reconcile / dedupe / backfill (apply flag opt-in) ----

        [Button("POST /admin/reconcile (uses reconcileApply)")] [BoxGroup("Apply")]
        private void PostReconcile() =>
            Send("POST", "/admin/reconcile", $"{{\"apply\":{(reconcileApply ? "true" : "false")}}}");

        [Button("POST /admin/playfab-duplicates (uses dedupeApply)")] [BoxGroup("Apply")]
        private void PostPlayfabDuplicates() =>
            Send("POST", "/admin/playfab-duplicates", $"{{\"apply\":{(dedupeApply ? "true" : "false")}}}");

        [Button("POST /admin/backfill (uses Backfill fields)")] [BoxGroup("Apply")]
        private void PostBackfill()
        {
            var sb = new StringBuilder("{");
            sb.Append("\"all\":").Append(backfillAll ? "true" : "false");
            if (backfillPlayerIds != null && backfillPlayerIds.Length > 0)
                sb.Append(",\"playerIds\":").Append(JsonStringArray(backfillPlayerIds));
            if (backfillTokens != null && backfillTokens.Length > 0)
                sb.Append(",\"tokens\":").Append(JsonStringArray(backfillTokens));
            sb.Append(",\"apply\":").Append(backfillApply ? "true" : "false");
            sb.Append("}");
            Send("POST", "/admin/backfill", sb.ToString());
        }

        // ---- HTTP plumbing ----

        private void Send(string method, string path, string jsonBody = null)
        {
            if (string.IsNullOrEmpty(apiUri)) { Log("apiUri is required"); return; }
            if (string.IsNullOrEmpty(adminToken)) { Log("adminToken is required"); return; }
            StartCoroutine(SendRoutine(method, path, jsonBody));
        }

        private IEnumerator SendRoutine(string method, string path, string jsonBody)
        {
            string url = $"{apiUri}{path}";
            using UnityWebRequest req = new UnityWebRequest(url, method)
            {
                downloadHandler = new DownloadHandlerBuffer(),
            };
            if (jsonBody != null)
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                req.SetRequestHeader("content-type", "application/json");
            }
            req.SetRequestHeader("x-playfab-auth-token", adminToken);

            Log($"→ {method} {path}{(jsonBody != null ? "  body=" + jsonBody : "")}");
            yield return req.SendWebRequest();

            string body = req.downloadHandler != null ? req.downloadHandler.text : "";
            string status = $"[{req.responseCode}] {req.result}";
            Log($"← {method} {path}\n{status}\n{body}");
        }

        private void Log(string msg)
        {
            lastResponse = msg;
            Debug.Log($"[AdminToolsRunner] {msg}");
        }

        // ---- JSON helpers (tiny — JsonUtility doesn't do plain string[] cleanly) ----

        private static string Escape(string s) =>
            s.Replace("\\", "\\\\").Replace("\"", "\\\"");

        private static string JsonStringArray(string[] arr)
        {
            var sb = new StringBuilder("[");
            for (int i = 0; i < arr.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"').Append(Escape(arr[i] ?? "")).Append('"');
            }
            sb.Append(']');
            return sb.ToString();
        }
    }
}
#endif
