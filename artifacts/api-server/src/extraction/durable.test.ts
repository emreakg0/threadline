import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync, fork, type ChildProcess } from "node:child_process";
const schema = "durable_test_" + randomUUID().replaceAll("-", "");
process.env.PGOPTIONS = `-c search_path=${schema}`;
const { pool } = await import("@workspace/db");
const { extract: enqueue } = await import("./service");
const { claim, processOne, finish, heartbeat, fail } = await import("./worker");
const { transaction, appendEvent, recoverExpired, cancel } =
  await import("./lifecycle");
const { ExtractionError } = await import("./validation");
const json = JSON.stringify({
  schema_version: 1,
  blocks: [
    {
      kind: "note",
      content: "🧵 Note",
      uncertainty_reason: null,
      evidence: [{ quote: "🧵 Note", start: 0, end: 6 }],
    },
  ],
});
const mock = { mode: "mock" as const, generate: async () => json };
const children: ChildProcess[] = [];
async function fixture() {
  // Advance only our disposable fixtures out of app daily limits between scenarios.
  await pool.query(
    "UPDATE threadline_runs SET created_at=now()-interval '2 days'",
  );
  const user = "durable-" + randomUUID(),
    doc = randomUUID(),
    source = randomUUID();
  await pool.query("INSERT INTO focus_users VALUES($1,$1,$1)", [user]);
  await pool.query(
    "INSERT INTO threadline_documents(id,user_id,title) VALUES($1,$2,$3)",
    [doc, user, "Fixture"],
  );
  await pool.query(
    "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,1,$4)",
    [source, user, doc, "🧵 Note"],
  );
  return { user, doc, source };
}
async function until(check: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Fixture wait timed out");
}
async function expire(id: string) {
  await pool.query(
    "UPDATE threadline_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [id],
  );
}
async function state(id: string) {
  return (await pool.query("SELECT * FROM threadline_runs WHERE id=$1", [id]))
    .rows[0];
}
function child(id: string, wait: boolean) {
  const c = fork(new URL("./worker.fixture.ts", import.meta.url), [], {
    execArgv: ["--import", import.meta.resolve("tsx")],
    env: {
      ...process.env,
      EXTRACTION_TEST_RUN: id,
      EXTRACTION_TEST_WAIT: wait ? "1" : "0",
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  children.push(c);
  return c;
}
async function kill(c: ChildProcess) {
  const ended = new Promise((resolve) => c.once("exit", resolve));
  c.kill("SIGKILL");
  await ended;
}
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const m = spawnSync(
    process.execPath,
    [
      new URL("../../../../lib/db/scripts/migrate.mjs", import.meta.url)
        .pathname,
    ],
    { env: process.env, encoding: "utf8", timeout: 60000 },
  );
  assert.equal(m.status, 0);
  let f = await fixture();
  const key = randomUUID();
  const duplicate = await Promise.all(
    Array.from({ length: 8 }, () => enqueue(f.user, f.source, key, "mock")),
  );
  assert.equal(new Set(duplicate.map((r) => r.id)).size, 1);
  const id = duplicate[0].id;
  const another = await enqueue(f.user, f.source, randomUUID(), "mock");
  assert.notEqual(id, another.id);
  const claims = await Promise.all([claim("mock", id), claim("mock", id)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const stale = claims.find(Boolean)!;
  await Promise.all(
    Array.from({ length: 20 }, (_, n) =>
      transaction((c) => appendEvent(c, id, "recovered", { test: n })),
    ),
  );
  const seq = (
    await pool.query(
      "SELECT sequence FROM threadline_execution_events WHERE run_id=$1 ORDER BY sequence",
      [id],
    )
  ).rows.map((r) => Number(r.sequence));
  assert.deepEqual(
    seq,
    seq.map((_, i) => i + 1),
  );
  await cancel(f.user, id);
  assert.equal(await claim("mock", another.id), null);
  assert.equal(await heartbeat(stale), false);
  assert.equal(await finish(stale, []), false);
  await expire(id);
  await cancel(f.user, another.id);
  assert.equal((await state(another.id)).started_at, null);
  assert.ok((await state(another.id)).completed_at);
  f = await fixture();
  let run = await enqueue(f.user, f.source, randomUUID(), "mock");
  let c = child(run.id, true);
  await new Promise((resolve) => c.once("message", resolve));
  await kill(c);
  await expire(run.id);
  assert.equal(await recoverExpired(), 1);
  assert.equal((await state(run.id)).status, "interrupted");
  assert.equal(await recoverExpired(), 0);
  assert.equal(await processOne(mock, run.id), false);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM threadline_knowledge_blocks WHERE originating_run_id=$1",
        [run.id],
      )
    ).rows[0].n,
    0,
  );
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  // Block the INSERT inside its transaction, then kill the actual worker process.
  const blocker = await pool.connect();
  await blocker.query("SELECT pg_advisory_lock(72810499)");
  await pool.query(
    `CREATE FUNCTION block_persist() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(72810499); RETURN NEW; END $$; CREATE TRIGGER block_persist BEFORE INSERT ON threadline_knowledge_blocks FOR EACH ROW EXECUTE FUNCTION block_persist()`,
  );
  c = child(run.id, false);
  await until(async () =>
    Boolean(
      (
        await pool.query(
          "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=72810499 AND NOT granted",
        )
      ).rowCount,
    ),
  );
  await kill(c);
  await blocker.query("SELECT pg_advisory_unlock(72810499)");
  blocker.release();
  await pool.query(
    "DROP TRIGGER block_persist ON threadline_knowledge_blocks; DROP FUNCTION block_persist()",
  );
  await expire(run.id);
  await recoverExpired();
  assert.equal((await state(run.id)).status, "interrupted");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM threadline_knowledge_blocks WHERE originating_run_id=$1",
        [run.id],
      )
    ).rows[0].n,
    0,
  );
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  let calls = 0;
  const retry = {
    mode: "mock" as const,
    generate: async () => {
      if (++calls === 1) throw new ExtractionError("PROVIDER_TRANSIENT");
      return json;
    },
  };
  await processOne(retry, run.id);
  assert.equal((await state(run.id)).status, "queued");
  assert.equal(await processOne(retry, run.id), false);
  await expire(run.id);
  await processOne(retry, run.id);
  assert.equal(calls, 2);
  assert.equal((await state(run.id)).status, "succeeded");
  assert.equal(await processOne(retry, run.id), false);
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  await processOne(
    {
      mode: "mock",
      generate: async () => {
        throw new ExtractionError("PROVIDER_TRANSIENT");
      },
    },
    run.id,
  );
  await expire(run.id);
  await processOne(
    {
      mode: "mock",
      generate: async () => {
        throw new ExtractionError("PROVIDER_TRANSIENT");
      },
    },
    run.id,
  );
  assert.equal((await state(run.id)).status, "failed");
  assert.equal(await processOne(mock, run.id), false);
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  let release: (v: string) => void = () => {};
  const waiting = processOne(
    {
      mode: "mock",
      generate: () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    },
    run.id,
  );
  await until(async () =>
    Boolean(
      (
        await pool.query(
          "SELECT 1 FROM threadline_runs WHERE id=$1 AND status='running'",
          [run.id],
        )
      ).rowCount,
    ),
  );
  await new Promise((r) => setTimeout(r, 100));
  await expire(run.id);
  await recoverExpired();
  release(json);
  await waiting;
  assert.equal((await state(run.id)).status, "interrupted");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM threadline_knowledge_blocks WHERE originating_run_id=$1",
        [run.id],
      )
    ).rows[0].n,
    0,
  );
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  await cancel(f.user, run.id);
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  await pool.query(
    `CREATE FUNCTION reject_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.position=1 THEN RAISE EXCEPTION 'fixture second insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_second BEFORE INSERT ON threadline_knowledge_blocks FOR EACH ROW EXECUTE FUNCTION reject_second()`,
  );
  const two = JSON.parse(json);
  two.blocks.push(two.blocks[0]);
  await processOne(
    { mode: "mock", generate: async () => JSON.stringify(two) },
    run.id,
  );
  assert.equal(
    (await state(run.id)).error_code,
    "STORAGE_OR_PROCESSING_FAILURE",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM threadline_knowledge_blocks WHERE originating_run_id=$1",
        [run.id],
      )
    ).rows[0].n,
    0,
  );
  await pool.query(
    "DROP TRIGGER reject_second ON threadline_knowledge_blocks; DROP FUNCTION reject_second()",
  );
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  const timeoutStart = Date.now();
  await processOne(
    { mode: "mock", generate: () => new Promise(() => {}) },
    run.id,
  );
  assert.equal((await state(run.id)).error_code, "PROVIDER_TIMEOUT");
  assert.ok(Date.now() - timeoutStart >= 11000);
  f = await fixture();
  run = await enqueue(f.user, f.source, randomUUID(), "mock");
  const pendingQuota = await enqueue(f.user, f.source, randomUUID(), "mock");
  await processOne(
    {
      mode: "mock",
      generate: async () => {
        throw new ExtractionError("QUOTA_EXHAUSTED");
      },
    },
    run.id,
  );
  assert.equal((await state(run.id)).error_code, "QUOTA_EXHAUSTED");
  await processOne(mock, pendingQuota.id);
  assert.equal((await state(pendingQuota.id)).error_code, "QUOTA_EXHAUSTED");
  const { ProviderQuotaError, MODEL, tokenReservation } =
    await import("./gemini");
  const {
    geminiUsage,
    projectDaily,
    userDaily,
    userQueue,
    nextPacificMidnight,
    pacificMidnight,
  } = await import("./quota");
  const first = await fixture();
  const second = await fixture();
  const enqueueLive = (f: typeof first) =>
    enqueue(f.user, f.source, randomUUID(), "gemini", 2);
  const [job, sameRevision] = await Promise.all([
    enqueueLive(first),
    enqueueLive(first),
  ]);
  assert.equal(job.id, sameRevision.id);
  const queued = await enqueueLive(second);
  assert.equal(job.model, MODEL);
  const results = await Promise.all([
    claim("gemini", job.id),
    claim("gemini", queued.id),
  ]);
  const claimed = results.find((item) => item !== null);
  assert.ok(claimed);
  assert.equal(results.filter(Boolean).length, 1);
  const waitingRun = claimed.id === job.id ? queued : job;
  const original = claimed.id === job.id ? first : second;
  assert.equal(await claim("gemini", waitingRun.id), null);
  await fail(claimed, new ExtractionError("PROVIDER_TRANSIENT"));
  assert.equal((await state(claimed.id)).status, "failed");
  assert.equal((await enqueueLive(original)).id, claimed.id);
  assert.equal(await claim("gemini", waitingRun.id), null); // Starts remain spaced after an early failure.
  assert.equal((await state(waitingRun.id)).status, "queued");
  const usage = () =>
    transaction((client) => geminiUsage(client, claimed.user_id));
  const reserved = await usage();
  assert.equal(reserved.rpm, 1);
  assert.equal(reserved.tpm, tokenReservation(claimed.source));
  await pool.query(
    "UPDATE threadline_execution_steps SET started_at=now()-interval '7 seconds',reserved_tokens=180000 WHERE id=$1",
    [claimed.step],
  );
  assert.equal((await usage()).spaced, true);
  assert.equal(await claim("gemini", waitingRun.id), null); // Rolling token budget.
  await pool.query(
    "UPDATE threadline_execution_steps SET started_at=now()-interval '61 seconds' WHERE id=$1",
    [claimed.step],
  );
  const next = await claim("gemini", waitingRun.id);
  assert.ok(next);
  assert.equal(next.attempt, 1);
  await cancel(next.user_id, next.id);
  await fail(next, new ProviderQuotaError(172800));
  const cooldown = await pool.query(
    `SELECT provider_blocked_until > ${nextPacificMidnight} AS waited, status FROM threadline_runs WHERE id=$1`,
    [next.id],
  );
  assert.deepEqual(cooldown.rows[0], { waited: true, status: "cancelled" });
  const extra = await fixture();
  await assert.rejects(enqueueLive(extra), { code: "QUOTA_EXHAUSTED" });
  await pool.query(
    "UPDATE threadline_runs SET provider_blocked_until=now()-interval '1 second',lease_expires_at=NULL WHERE id=$1",
    [next.id],
  );
  // Seed only isolated reservation rows to exercise the application ceilings without dispatching.
  const seedReservations = (count: number, day: string) =>
    pool.query(
      `INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at,reserved_tokens)
     SELECT gen_random_uuid(),$1,$2,'extract',n+1,'running',${day},1 FROM generate_series(1,$3::int) n`,
      [extra.user, extraRun.id, count],
    );
  const extraRun = await enqueueLive(extra);
  await seedReservations(userDaily, pacificMidnight);
  await assert.rejects(
    (async () => {
      const another = randomUUID();
      await pool.query(
        "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,2,'New note')",
        [another, extra.user, extra.doc],
      );
      await enqueueLive({ ...extra, source: another });
    })(),
    { code: "DAILY_QUOTA" },
  );
  await pool.query("DELETE FROM threadline_execution_steps WHERE run_id=$1", [
    extraRun.id,
  ]);
  await seedReservations(projectDaily, pacificMidnight);
  await assert.rejects(enqueueLive(await fixture()), { code: "DAILY_QUOTA" });
  await pool.query(
    `UPDATE threadline_execution_steps SET started_at=${pacificMidnight}-interval '1 day' WHERE run_id=$1`,
    [extraRun.id],
  );
  await enqueueLive(await fixture());
  await pool.query("DELETE FROM threadline_execution_steps WHERE run_id=$1", [
    extraRun.id,
  ]);
  for (let revision = 3; revision <= 2 + userQueue; revision++) {
    const another = randomUUID();
    await pool.query(
      "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,$4,'Other note')",
      [another, extra.user, extra.doc, revision],
    );
    const submit = enqueueLive({ ...extra, source: another });
    if (revision === 2 + userQueue)
      await assert.rejects(submit, { code: "QUEUE_FULL" });
    else await submit;
  }
  // Closing the gate fails queued work without recording a dispatch or reading the key.
  await processOne(undefined, extraRun.id);
  assert.equal((await state(extraRun.id)).error_code, "LIVE_DISABLED");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM threadline_execution_steps WHERE run_id=$1",
        [extraRun.id],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS: Gemini quota serialization, revision deduplication, spacing, token reservations, Pacific daily and queue ceilings, 429 cooldown and closed gate",
  );
  console.log(
    "PASS: concurrent enqueue/claims/event sequences; actual child SIGKILL at provider wait and blocked persistence; lease reconciliation, duplicate recovery, cancellation/stale fencing, bounded retry/exhaustion and atomic rollback",
  );
} finally {
  for (const c of children)
    if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
