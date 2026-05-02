import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generateThumbnailURL,
  removeThumbnailURL,
} from "../../src/utils/thumbnails";

test("generateThumbnailURL prepends /thumbnails/", () => {
  assert.equal(generateThumbnailURL("a.png"), "/thumbnails/a.png");
});

test("removeThumbnailURL strips /thumbnails/", () => {
  assert.equal(removeThumbnailURL("/thumbnails/a.png"), "a.png");
});

test("generateThumbnailURL and removeThumbnailURL round-trip", () => {
  for (const name of ["a.png", "uuid-1234.jpg", "x.bmp"]) {
    assert.equal(removeThumbnailURL(generateThumbnailURL(name)), name);
  }
});

test("removeThumbnailURL leaves a non-prefixed string untouched", () => {
  assert.equal(removeThumbnailURL("plain.png"), "plain.png");
});
