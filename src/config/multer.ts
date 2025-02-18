import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { FURNITURE_PATH, THUMBNAIL_PATH } from "./path";

const MIME_TYPES_COMPRESSED = [
  "application/zip",
  "application/octet-stream",
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "thumbnail") {
      cb(null, THUMBNAIL_PATH);
      return;
    }
    cb(null, FURNITURE_PATH);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fileName = randomUUID() + ext;
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 500, // 500MB
  },
  fileFilter: (req, file, cb) => {
    if (
      file.fieldname === "file" &&
      (MIME_TYPES_COMPRESSED.includes(file.mimetype) ||
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
    cb(null, false);
  },
});

export const uploadFurniture = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

export const uploadFurnitureFile = upload.single("file");

export const uploadFurnitureThumbnail = upload.single("thumbnail");

export interface UploadedFiles {
  file: Express.Multer.File[];
  thumbnail: Array<Express.Multer.File | undefined>;
}
