import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

import { deleteFile } from "../../src/utils/file";

const SCRATCH = path.join(
  os.tmpdir(),
  `furniture-file-test-${process.pid}-${randomUUID()}`
);
fs.mkdirSync(SCRATCH, { recursive: true });

test("deleteFile resolves silently when the path does not exist", async () => {
  await deleteFile(path.join(SCRATCH, "missing.bin"));
});

test("deleteFile removes an existing file", async () => {
  const filePath = path.join(SCRATCH, "doomed.txt");
  fs.writeFileSync(filePath, "bye");
  assert.equal(fs.existsSync(filePath), true);

  await deleteFile(filePath);

  assert.equal(fs.existsSync(filePath), false);
});

test.after(() => {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});
