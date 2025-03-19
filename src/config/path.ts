import path from "node:path";
import fs from "node:fs";

export const PUBLIC_PATH = "/var/furniture-server/public";

export const FURNITURE_PATH = "/var/furniture-server/furnitures";

export const THUMBNAIL_PATH = path.join(PUBLIC_PATH, "thumbnails");

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
