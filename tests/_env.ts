import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

export const TMP_ROOT = path.join(
  os.tmpdir(),
  `furniture-test-${process.pid}-${randomUUID()}`
);

fs.mkdirSync(TMP_ROOT, { recursive: true });

process.env.DISK_ROOT_PATH = TMP_ROOT;
process.env.NODE_ENV = "development";

// Safety net: if a test file forgets to call cleanupAll(), still try to remove
// the temp dir at process exit. Best-effort and synchronous.
process.on("exit", () => {
  try {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch {
    // ignore — Windows can hold file handles briefly past process end
  }
});
