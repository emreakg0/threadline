// Runs only the built server on loopback with synthetic configuration and an isolated database schema.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import pg from "pg";

const schema = "release_test_" + randomUUID().replaceAll("-", "");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=" + schema });
const before = new URL("../migrations/", import.meta.url);
const migrator = new URL("./migrate.mjs", import.meta.url);
const entry = new URL("../../../artifacts/api-server/dist/index.mjs", import.meta.url);
const env = {
  ...process.env, PGOPTIONS: "-c search_path=" + schema, NODE_ENV: "production",
  APP_ORIGIN: "https://threadline.example.invalid",
  GOOGLE_CLIENT_ID: "offline-oauth-client", GOOGLE_CLIENT_SECRET: "offline-oauth-fixture",
  THREADLINE_PRODUCTION_AI_APPROVED: "false", THREADLINE_GEMINI_LIVE_AUTHORIZED: "false",
};
const origin = env.APP_ORIGIN;
let child;
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const client = await pool.connect();
  const legacyRun = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE focus_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const file of (await readdir(before)).sort().filter((name) => /^00(?:0[1-9]|10)_.*\.sql$/.test(name))) {
      await client.query(await readFile(new URL(file, before), "utf8"));
      await client.query("INSERT INTO focus_migrations(name) VALUES($1)", [file.slice(0,-4)]);
    }
    const doc = randomUUID(), source = randomUUID();
    await client.query("INSERT INTO focus_users VALUES('offline','Offline','offline@example.invalid')");
    await client.query("INSERT INTO threadline_documents(id,user_id,title) VALUES($1,'offline','Synthetic draft')", [doc]);
    await client.query("INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,'offline',$2,1,'Synthetic source')", [source, doc]);
    await client.query(`INSERT INTO threadline_runs
      (id,user_id,source_revision_id,document_id,idempotency_key,pipeline_version,schema_version,provider,model,prompt_version,status)
      VALUES($1,'offline',$2,$3,'stage4b_fixture','fixture',1,'mock','fixture','fixture','cancelled')`, [legacyRun, source, doc]);
    await client.query(`INSERT INTO threadline_execution_events(id,user_id,run_id,sequence,event_type)
      VALUES($1,'offline',$2,1,'cancelled')`, [randomUUID(), legacyRun]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  const events = () => pool.query("SELECT * FROM threadline_execution_events WHERE run_id=$1 ORDER BY sequence", [legacyRun]);
  const originalEvents = (await events()).rows;
  assert.equal(originalEvents.length, 1);
  for (let attempt = 0; attempt < 2; attempt++) {
    const migration = spawnSync(process.execPath, [migrator.pathname], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(migration.status, 0, migration.stderr);
  }
  assert.deepEqual((await events()).rows, originalEvents);
  assert.equal((await pool.query("SELECT * FROM focus_migrations WHERE name LIKE '0011_%' OR name LIKE '0012_%'")).rowCount, 2);

  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  env.PORT = String(probe.address().port);
  await new Promise(resolve => probe.close(resolve));
  child = spawn(process.execPath, [entry.pathname], { env, stdio: "ignore" });
  const base = "http://127.0.0.1:" + env.PORT;
  const probeReady = async () => (await fetch(base + "/api/readyz", { signal: AbortSignal.timeout(750) })).ok;
  let ready = false;
  for (let index = 0; index < 40 && !ready; index++) {
    ready = await probeReady().catch(() => false);
    if (!ready) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(ready, true);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const html = await page.text();
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(asset);
  const bundle = await (await fetch(base + asset)).text();
  assert.ok(bundle.includes("Failure and recovery"));
  assert.ok(!bundle.includes("offline-oauth-fixture"));
  for (const path of ["/demo", "/privacy", "/terms"]) assert.equal((await fetch(base + path)).status, 200);
  const callback = await fetch(base + "/api/auth/google", { redirect: "manual" });
  assert.equal(callback.status, 302);
  assert.equal(new URL(callback.headers.get("location")).searchParams.get("redirect_uri"), origin + "/api/auth/google/callback");
  assert.equal(new URL(callback.headers.get("location")).searchParams.get("code_challenge_method"), "S256");
  const cookies = callback.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every(cookie => cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax")));
  for (const path of ["/api/extractions", "/api/documents", "/api/action-threads"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await fetch(base + "/api/missing")).status, 401);
  assert.equal((await fetch(base + "/.env")).ok, false);
  console.log("PASS: preserved pre-0011 trace, migration upgrade/re-run, built landing and demo bundle, readiness, HTTPS OAuth redirect and cookies, private APIs");
} finally {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    const stop = setTimeout(() => child.kill("SIGKILL"), 25000);
    await once(child, "exit");
    clearTimeout(stop);
  }
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
