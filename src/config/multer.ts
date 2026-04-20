/**
 * Multer configuration for all furniture file uploads.
 *
 * ## Storage
 * Files land in different directories based on their form field name:
 * - `file` field → `FURNITURE_PATH` (zip archives)
 * - `thumbnail` field → `THUMBNAIL_PATH` (images)
 *
 * Both are renamed on arrival to `<uuid><original-extension>` so filenames are
 * unique and safe to use as `local_name` / thumbnail identifiers in the DB.
 *
 * ## Validation
 * The `file` field is accepted by MIME type OR by file extension, because some
 * clients (notably Unity's UnityWebRequest) send generic MIME types such as
 * `application/octet-stream` for zip files regardless of the actual content.
 * The `thumbnail` field is validated by MIME type only.
 *
 * Rejected files are silently dropped (multer calls `cb(null, false)`); the
 * controller then receives no `req.file` / `req.files` entry for that field
 * and should respond with an appropriate error.
 *
 * ## Adding new file types
 * - Archive types: add the MIME type to `MIME_TYPES_COMPRESSED` **and** the
 *   extension (without dot, lowercase) to `EXTENSIONS_COMPRESSED`.
 * - Image types: add the MIME type to `MIME_TYPES_IMAGES`. The commented-out
 *   entries show types that were considered but intentionally excluded.
 */

import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "./path";

/** MIME types accepted for the `file` field (zip archives and equivalents). */
const MIME_TYPES_COMPRESSED = [
  "application/zip",
  "application/octet-stream",   // sent by Unity's UnityWebRequest for any binary
  "application/x-zip-compressed",
  "multipart/x-zip",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-bzip2",
  "application/x-xz",
  "application/vnd.ms-cab-compressed",
];

/**
 * File extensions accepted for the `file` field when the MIME type is not
 * conclusive. Checked without a leading dot, lowercase.
 */
const EXTENSIONS_COMPRESSED = [
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "bz2",
  "xz",
  "cab",
];

/**
 * MIME types accepted for the `thumbnail` field. GIF, TIFF, SVG, WebP, and
 * ICO are intentionally excluded — only JPEG, PNG, and BMP are supported.
 */
const MIME_TYPES_IMAGES = [
  "image/jpeg",
  "image/png",
  // "image/gif",
  "image/bmp",
  // "image/tiff",
  // "image/svg+xml",
  // "image/webp",
  // "image/x-icon",
];

/**
 * Disk storage engine that routes each upload to the correct directory and
 * renames files to `<uuid><ext>` to avoid collisions and path-traversal risks.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Route by field name so a single multer instance handles both file types.
    if (file.fieldname === "thumbnail") {
      cb(null, THUMBNAIL_PATH);
      return;
    }
    cb(null, FURNITURE_PATH);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // UUID preserves the extension for MIME sniffing while making the name
    // unique and unpredictable on disk.
    const fileName = randomUUID() + ext;
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 500, // 500 MB — furniture packages can be large
  },
  fileFilter: (req, file, cb) => {
    if (
      file.fieldname === "file" &&
      (MIME_TYPES_COMPRESSED.includes(file.mimetype) ||
        // Fall back to extension check because some clients send a generic MIME type.
        EXTENSIONS_COMPRESSED.includes(
          path.extname(file.originalname).toLowerCase().replace(".", "")
        ))
    ) {
      cb(null, true);
      return;
    }
    if (
      file.fieldname === "thumbnail" &&
      MIME_TYPES_IMAGES.includes(file.mimetype)
    ) {
      cb(null, true);
      return;
    }
    // Silently reject unrecognised field names or disallowed types; the
    // controller is responsible for detecting and reporting the missing field.
    cb(null, false);
  },
});

/**
 * Multer middleware for `POST /api/v1/furniture`.
 * Accepts both the `file` (zip, required) and `thumbnail` (image, optional) fields.
 * Populated as `req.files` — cast via `UploadedFiles` to access typed fields.
 */
export const uploadFurniture = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

/**
 * Multer middleware for `POST /api/v1/furniture/:id/file`.
 * Accepts a single `file` field (zip). Populated as `req.file`.
 */
export const uploadFurnitureFile = upload.single("file");

/**
 * Multer middleware for `POST /api/v1/furniture/:id/thumbnail` and
 * `POST /api/v1/duplicate-furniture/:token`.
 * Accepts a single `thumbnail` field (image). Populated as `req.file`.
 */
export const uploadFurnitureThumbnail = upload.single("thumbnail");

/**
 * Type for `req.files` when using `uploadFurniture`.
 * Cast from `req.files as unknown as UploadedFiles` in the controller.
 */
export interface UploadedFiles {
  file: Express.Multer.File[];
  thumbnail: Array<Express.Multer.File | undefined>;
}
