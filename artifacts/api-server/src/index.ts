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
// This checks only local authorization; it never invokes provider transport.
let betaGatesOpen = false;
let betaGateCode: string | null = null;
try {
 liveAccess();
 betaGatesOpen = true;
} catch (error) {
 // Disabled or expired approvals are a normal, fail-closed startup state.
 betaGateCode = error instanceof ExtractionError ? error.code : "GATE_CHECK_FAILED";
}
logger.info({
 enabled: betaGatesOpen,
 code: betaGateCode,
 liveFlag: process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED === "true",
 approvalPresent: Boolean(process.env.THREADLINE_GEMINI_FREE_TIER_APPROVAL),
 nodeProduction: process.env.NODE_ENV === "production",
}, 'Development Gemini authorization status');
try {
 await pool.query('SELECT 1 FROM focus_migrations WHERE name=$1', ['0006_threadline_action_plans']).then(result => { if (!result.rowCount) throw new Error('Migration not applied'); });
} catch {
 logger.fatal('Database readiness failed. Check DATABASE_URL and run node lib/db/scripts/migrate.mjs before starting the API.');
 await pool.end();
 process.exit(1);
}
startWorker();
app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
