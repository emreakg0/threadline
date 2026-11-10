import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

for (const name of ['APP_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DATABASE_URL']) {
 logger.info({ variable: name, present: Boolean(process.env[name]) }, 'Configuration presence');
}
try {
 await pool.query('SELECT 1 FROM focus_migrations WHERE name=$1', ['0002_city_slots']).then(result => { if (!result.rowCount) throw new Error('Migration not applied'); });
} catch {
 logger.fatal('Database readiness failed. Check DATABASE_URL and run node lib/db/scripts/migrate.mjs before starting the API.');
 await pool.end();
 process.exit(1);
}
app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
