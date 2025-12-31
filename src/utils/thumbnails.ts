const THUMBNAIL_PREFIX = "/thumbnails/";

export function generateThumbnailURL(thumbnail: string) {
  return `${THUMBNAIL_PREFIX}${thumbnail}`;
}

export function removeThumbnailURL(thumbnail: string) {
  return thumbnail.replace(THUMBNAIL_PREFIX, "");
}
