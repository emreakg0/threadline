import express from "express";
import { fileURLToPath } from "node:url";
import { startWorker } from "./extraction/worker";
import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { liveAccess } from "./extraction/gemini";
import { ExtractionError } from "./extraction/validation";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

for (const name of ['APP_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DATABASE_URL']) {
 logger.info({ variable: name, present: Boolean(process.env[name]) }, 'Configuration presence');
}
// Startup checks configuration locally without contacting the provider.
if (process.env.NODE_ENV === "production") {
 logger.info({ operatorOptIn: process.env.THREADLINE_PRODUCTION_AI_APPROVED === "true" }, "Production AI opt-in");
} else {
 try {
  liveAccess();
  logger.info({ enabled: true }, "Development Gemini authorization status");
 } catch (error) {
  logger.info({ enabled: false, code: error instanceof ExtractionError ? error.code : "GATE_CHECK_FAILED" },
    "Development Gemini authorization status");
 }
}
try {
 await pool.query('SELECT 1 FROM focus_migrations WHERE name=$1', ['0012_threadline_production_consent']).then(result => { if (!result.rowCount) throw new Error('Migration not applied'); });
} catch {
 logger.fatal('Database readiness failed. Check DATABASE_URL and run node lib/db/scripts/migrate.mjs before starting the API.');
 await pool.end();
 process.exit(1);
}
if (process.env.NODE_ENV === "production") {
 const frontend = fileURLToPath(new URL("../../productivity-app/dist/public/", import.meta.url));
 const webHeaders = (res: express.Response) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 };
 app.get(["/demo", "/privacy", "/terms"], (_req, res) => {
  webHeaders(res);
  res.sendFile("index.html", { root: frontend });
 });
 app.use(express.static(frontend, {
  index: "index.html",
  dotfiles: "deny",
  setHeaders: webHeaders,
 }));
}
const stopWorker = startWorker();
const server = app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

function shutdown() {
 server.close();
 const deadline = setTimeout(() => process.exit(1), 20_000).unref();
 void stopWorker().then(() => pool.end()).then(() => clearTimeout(deadline)).catch(() => process.exit(1));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
