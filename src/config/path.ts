/**
 * Filesystem path constants derived from `DISK_ROOT_PATH` and helpers to
 * create the directory tree on first run.
 *
 * ## Directory layout
 *
 * ```
 * DISK_ROOT_PATH/          ← ROOT_PATH
 *   furnitures/            ← FURNITURE_PATH  (zip archives, not served directly)
 *   public/                ← PUBLIC_PATH     (served as static files by Express)
 *     thumbnails/          ← THUMBNAIL_PATH  (thumbnail images, publicly accessible)
 * ```
 *
 * `FURNITURE_PATH` sits outside `public/` intentionally — zip files are served
 * only through the authenticated `GET /api/v1/furniture/:id` endpoint via
 * `res.sendFile`, never as static assets.
 *
 * `THUMBNAIL_PATH` sits inside `public/` so Express can serve thumbnails as
 * static files at `/thumbnails/<filename>` without hitting a route handler.
 * This is what makes the `GET /thumbnails/:id` endpoint authentication-free.
 *
 * All constants are resolved at module load time from `ENV.DISK_ROOT_PATH`.
 * Call `initPaths()` once at startup before any file I/O to ensure the
 * directories exist.
 */

import path from "node:path";
import fs from "node:fs";
import { ENV } from "./env";

/** Absolute path to the root storage directory (`DISK_ROOT_PATH`). */
export const ROOT_PATH = path.resolve(ENV.DISK_ROOT_PATH);

/**
 * Absolute path to the static-file directory served by Express.
 * Maps to `ROOT_PATH/public/`.
 */
export const PUBLIC_PATH = path.join(ROOT_PATH, "public");

/**
 * Absolute path where furniture zip archives are stored on disk.
 * Maps to `ROOT_PATH/furnitures/`.
 * Not served as static files — access is gated behind the auth middleware.
 */
export const FURNITURE_PATH = path.join(ROOT_PATH, "furnitures");

/**
 * Absolute path where thumbnail images are stored on disk.
 * Maps to `ROOT_PATH/public/thumbnails/`.
 * Served as static files at `/thumbnails/<filename>` — publicly accessible
 * without authentication.
 */
export const THUMBNAIL_PATH = path.join(PUBLIC_PATH, "thumbnails");

/**
 * Creates any missing directories in the storage tree.
 *
 * Must be called once before any file I/O (upload, read, delete). Called by
 * both `src/index.ts` (server startup) and `src/config/db.ts` (migration
 * runner) to ensure paths exist regardless of the entry point.
 *
 * Uses `recursive: true` so it is safe to call multiple times — existing
 * directories are silently skipped.
 */
export function initPaths() {
  if (!fs.existsSync(PUBLIC_PATH)) {
    fs.mkdirSync(PUBLIC_PATH, { recursive: true });
  }
  if (!fs.existsSync(FURNITURE_PATH)) {
    fs.mkdirSync(FURNITURE_PATH, { recursive: true });
  }
  if (!fs.existsSync(THUMBNAIL_PATH)) {
    fs.mkdirSync(THUMBNAIL_PATH, { recursive: true });
  }
}
