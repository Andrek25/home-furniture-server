/**
 * Application entry point.
 *
 * Startup sequence (order matters):
 *  1. Middleware registered — helmet, CORS, morgan, JSON body parser.
 *  2. Static files mounted at `PUBLIC_PATH` — serves thumbnails unauthenticated.
 *  3. Health-check route registered (`GET /`).
 *  4. API routes registered via `setupRoutes`.
 *  5. `initPaths()` — creates storage directories if they don't exist.
 *  6. `initDatabase()` — opens the SQLite connection and populates `db`.
 *  7. Server starts listening.
 *
 * `initPaths` and `initDatabase` are called after route registration because
 * route setup is synchronous and has no dependency on the DB or filesystem.
 * Keeping them last makes the startup failures (missing disk, bad DB) easy to
 * distinguish from configuration errors.
 */

import express from "express";
import cors from "cors";
import { ENV } from "./config/env";
import { setupRoutes } from "./routes";
import { initPaths, PUBLIC_PATH } from "./config/path";
import morgan from "morgan";
import helmet from "helmet";
import { initDatabase } from "./config/db";

const app = express();

// Security headers (Content-Security-Policy, X-Frame-Options, etc.).
app.use(helmet());

// Allow any origin with credentials so the Unity client and web tools can
// reach the server without being blocked by CORS preflight.
app.use(
  cors({
    credentials: true,
    origin: true,
  })
);

// "combined" (Apache-style) in production for structured log ingestion;
// "dev" (colourised, concise) in development for readability.
app.use(morgan(ENV.PROD ? "combined" : "dev"));

app.use(express.json());

// Serve everything under PUBLIC_PATH (thumbnails) as static files.
// This is what makes GET /thumbnails/:filename work without a route handler.
app.use(express.static(PUBLIC_PATH));

app.get("/", (req, res) => {
  res.send("Hello World");
});

setupRoutes(app);

initPaths();

initDatabase();

app.listen(ENV.PORT, () => {
  console.log(`Server is running on port ${ENV.PORT}`);
});
