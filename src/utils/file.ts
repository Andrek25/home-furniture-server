import fs from "node:fs";

export function deleteFile(path: string) {
  if (!fs.existsSync(path)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
