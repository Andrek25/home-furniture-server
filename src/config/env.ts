/**
 * Typed environment configuration, read once at startup from `process.env`.
 *
 * All other modules import `ENV` from here instead of reading `process.env`
 * directly, so there is a single place to see every variable the app uses,
 * its type, and its default value.
 *
 * In development (`NODE_ENV !== "production"`) the resolved values are printed
 * to stdout on startup to aid debugging — this intentionally includes
 * `PLAYFAB_DEVELOPER_SECRET_KEY`, so do not run in dev mode on shared machines.
 *
 * ## Required variables (no safe default)
 * | Variable | Description |
 * |---|---|
 * | `PLAYFAB_TITLE_ID` | PlayFab title identifier. Defaults to `""` which will cause every auth call to fail. |
 * | `PLAYFAB_DEVELOPER_SECRET_KEY` | Server-side PlayFab secret. Defaults to `""` — same consequence. |
 *
 * ## Optional variables
 * | Variable | Default | Description |
 * |---|---|---|
 * | `NODE_ENV` | `"development"` | Controls `DEV`/`PROD` flags and startup logging. |
 * | `PORT` | `4000` | TCP port the Express server listens on. |
 * | `DISK_ROOT_PATH` | `"/var/furniture-server"` | Absolute path to the root storage directory. Sub-directories (`furnitures/`, `public/thumbnails/`) are created automatically by `initPaths()`. |
 * | `DUPLICATE_TOKEN_EXPIRY` | `10` | Duplicate token lifetime in **minutes**. Stored on the token row for auditing; not actively enforced at claim time. |
 */

interface Env {
  /** `"development"` or `"production"`. Defaults to `"development"`. */
  NODE_ENV: "development" | "production";
  /** `true` when `NODE_ENV === "development"`. */
  DEV: boolean;
  /** `true` when `NODE_ENV === "production"`. */
  PROD: boolean;
  /** TCP port the HTTP server listens on. Default: `4000`. */
  PORT: number;
  /** PlayFab title ID. Required — an empty string will fail all auth calls. */
  PLAYFAB_TITLE_ID: string;
  /** PlayFab developer secret key. Required — keep this out of version control. */
  PLAYFAB_DEVELOPER_SECRET_KEY: string;
  /**
   * Absolute path to the root storage directory. Sub-directories are created
   * automatically. Default: `"/var/furniture-server"`.
   */
  DISK_ROOT_PATH: string;
  /**
   * Lifetime of a duplicate token in minutes. Stored for auditing but not
   * enforced at claim time. Default: `10`.
   */
  DUPLICATE_TOKEN_EXPIRY: number;
  /**
   * PlayFab ID of the single account allowed to call /admin/* routes. The
   * admin middleware authenticates via the normal X-PlayFab-Auth-Token header
   * and rejects any caller whose resolved PlayFab ID does not match this.
   */
  ADMIN_PLAYFAB_ID: string;
}

const NODE_ENV = <Env["NODE_ENV"]>process.env.NODE_ENV || "development";

/**
 * Resolved environment configuration for the entire application.
 * Imported by all modules that need runtime settings.
 */
export const ENV: Env = {
  NODE_ENV,
  DEV: NODE_ENV === "development",
  PROD: NODE_ENV === "production",
  PORT: Number(process.env.PORT) || 4_000,
  PLAYFAB_TITLE_ID: process.env.PLAYFAB_TITLE_ID || "",
  PLAYFAB_DEVELOPER_SECRET_KEY: process.env.PLAYFAB_DEVELOPER_SECRET_KEY || "",
  DISK_ROOT_PATH: process.env.DISK_ROOT_PATH || "/var/furniture-server",
  DUPLICATE_TOKEN_EXPIRY: Number(process.env.DUPLICATE_TOKEN_EXPIRY) || 10,
  ADMIN_PLAYFAB_ID: process.env.ADMIN_PLAYFAB_ID || "DAB674F3C666368C",
};

// Print all resolved values in dev so misconfiguration is visible immediately.
// Includes the secret key — do not use dev mode on shared or public machines.
if (ENV.DEV) {
  console.log(ENV);
}
