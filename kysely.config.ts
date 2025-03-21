import { defineConfig } from "kysely-ctl";
import { dialect, initDatabase } from "./src/config/db";

initDatabase();

export default defineConfig({
  dialect,
  migrations: {
    migrationFolder: "src/db/migrations",
  },
});
