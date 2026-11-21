import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { calcPlan, calcSource, portfolioPlan, portfolioSource } from "./fixtures";
import { actionThreadRequest } from "./prompt";
import { validateActionThread } from "./graph";
import type { ActionThread } from "./contract";
import type { readProgress, ThreadOperation } from "./progress";

const schema = "action_thread_test_" + randomUUID().replaceAll("-", "");
process.env.PGOPTIONS = `-c search_path=${schema}`;
process.env.APP_ORIGIN = "http://localhost:5173";
const { pool } = await import("@workspace/db");
const { default: app } = await import("../app");
const { requireSession } = await import("../routes/focus");
const { actionThreadRouter } = await import("../routes/action-threads");
const { claim, finish, processOne } = await import("../extraction/worker");
const { recoverExpired } = await import("../extraction/lifecycle");
const { extract } = await import("../extraction/service");
const { ENDPOINT, MODEL, gemini, tokenReservation } = await import("../extraction/gemini");
const { ExtractionError } = await import("../extraction/validation");
const users = [0, 1].map(() => BigInt("0x" + randomBytes(12).toString("hex")).toString());
const sessions = users.map(() => randomBytes(32).toString("hex"));
const mockRoute = "/test-action-threads";
const route = "/action-threads";
let server: ReturnType<typeof app.listen> | undefined;
let base = "";
const originalFetch = globalThis.fetch;
let providerFixture: ((init?: RequestInit) => Response) | undefined;
globalThis.fetch = (input, init) => {
  if (String(input) === ENDPOINT && providerFixture)
    return Promise.resolve(providerFixture(init));
  assert.match(String(input), /^http:\/\/127\.0\.0\.1:\d+\/api\//, "Only the local HTTP fixture may be called");
  return originalFetch(input, init);
};

type Options = { method?: string; body?: unknown; user?: number | null; origin?: string };
async function request<T = { error: string }>(path: string, status: number, options: Options = {}): Promise<T> {
  const { method = "GET", body, user = 0, origin = process.env.APP_ORIGIN! } = options;
  const headers = { "Content-Type": "application/json", origin, cookie: user === null ? "" : `focus_session=${sessions[user]}` };
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.status, status, `${method} ${path}`);
  return response.json() as Promise<T>;
}

async function startServer() {
  const test = express();
  test.use(`/api${mockRoute}`, express.json(), requireSession, actionThreadRouter("mock"));
  test.use(app);
  server = test.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api`;
}

async function stopServer() {
  await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
}

type Document = { id: string; version: number; source: { id: string } };
const save = (source_text: string, user = 0) => request<Document>("/documents", 201, {
  method: "POST", body: { id: randomUUID(), title: "Synthetic source", source_text }, user,
});
const submission = (document: Document) => ({
  source_revision_id: document.source.id, idempotency_key: randomUUID(), consent: true,
});
type Job = { id: string; status: string; schema_version: number };
const enqueue = (body: ReturnType<typeof submission>) =>
  request<Job>(mockRoute, 202, { method: "POST", body });
const detail = (id: string, user = 0) => request<{ graph: ActionThread; source_revision_id: string; provider: string }>(`${route}/${id}`, 200, { user });
type Progress = Awaited<ReturnType<typeof readProgress>>;
const progress = (id: string, after = 0) => request<Progress>(`${route}/${id}/progress?after_version=${after}`, 200);
const withVersion = (operation: ThreadOperation, version: number) => ({
  ...operation, expected_version: version, idempotency_key: randomUUID(),
});
type Command = ReturnType<typeof withVersion>;
type Transition = Pick<Progress, "progress" | "active_next_steps"> & { replayed: boolean };
const post = <T = Transition>(id: string, body: Command, status = 200, user = 0) =>
  request<T>(`${route}/${id}/${body.operation === "approve" || body.operation === "reject" ? "review" : "progress"}`,
    status, { method: "POST", body, user });
async function change(id: string, state: Progress["progress"], operation: ThreadOperation) {
  return (await post(id, withVersion(operation, state.version))).progress;
}
const complete = (id: string, state: Progress["progress"], node_id: string) =>
  change(id, state, { operation: "complete", node_id });
const decide = (id: string, state: Progress["progress"], node_id: string, to_node_id: string) =>
  change(id, state, { operation: "decide", node_id, to_node_id });
const apiRun = (id: string, user = 0) =>
  request<{ run: Job & { error_code: string }; blocks: unknown[] }>(`/extractions/${id}`, 200, { user });
const mock = (output: unknown) => ({ mode: "mock" as const, generate: async () => JSON.stringify(output) });

async function failed(id: string, status: string, error?: string, user = 0) {
  const { run, blocks } = await apiRun(id, user);
  assert.equal(run.status, status);
  if (error) assert.equal(run.error_code, error);
  assert.deepEqual(blocks, []);
  await request(`${route}/${id}`, 404, { user });
  for (const table of ["threads", "thread_nodes", "thread_edges", "thread_progress", "thread_transitions"]) {
    const column = table === "threads" ? "id" : "thread_id";
    assert.equal((await pool.query(`SELECT 1 FROM threadline_action_${table} WHERE ${column}=$1`, [id])).rowCount, 0);
  }
}

let schemaCreated = false;
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  const migrated = spawnSync(process.execPath, [new URL("../../../../lib/db/scripts/migrate.mjs", import.meta.url).pathname],
    { env: process.env, encoding: "utf8", timeout: 60000 });
  assert.equal(migrated.status, 0, "Isolated migration failed");
  for (const [index, user] of users.entries()) {
    await pool.query("INSERT INTO focus_users VALUES($1,'Offline fixture','fixture@example.invalid')", [user]);
    await pool.query("INSERT INTO focus_sessions VALUES($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(sessions[index]).digest("hex"), user]);
  }
  const { rows: [grant] } = await pool.query(
    "INSERT INTO threadline_beta_grant(user_id,starts_at,expires_at,request_limit) VALUES($1,now(),now()+interval '1 hour',3) RETURNING id",
    [users[0]],
  );
  await startServer();
  await request(route, 401, { user: null });
  const doc = await save(calcSource);
  const body = submission(doc);
  const foreign = submission(await save(portfolioSource, 1));
  assert.equal((await request(route, 503, { method: "POST", body })).error, "THREAD_LIVE_DISABLED");
  assert.equal((await request(mockRoute, 400, { method: "POST", body: { ...body, consent: false } })).error, "CONSENT_REQUIRED");
  await request(mockRoute, 403, { method: "POST", body, origin: "https://untrusted.invalid" });
  await request(mockRoute, 400, { method: "POST", body: { ...body, provider: "mock" } });
  await request(mockRoute, 404, { method: "POST", body: foreign });
  assert.equal((await request(mockRoute, 403, { method: "POST", body: foreign, user: 1 })).error, "BETA_UNAVAILABLE");

  const [job, duplicate] = await Promise.all([enqueue(body), enqueue(body)]);
  assert.deepEqual(duplicate, job);
  assert.equal(job.schema_version, 3);
  assert.equal((await request(mockRoute, 409, { method: "POST", body: { ...body, idempotency_key: randomUUID() } })).error, "THREAD_REQUEST_EXISTS");
  assert.equal((await request<Job>(`/extractions/${job.id}/progress`, 200)).status, "queued");
  assert.equal(await processOne(mock(calcPlan()), job.id), true);
  const original = await detail(job.id);
  assert.deepEqual(original.graph, validateActionThread(JSON.stringify(calcPlan()), calcSource));
  assert.equal(original.provider, "mock");
  assert.equal(original.source_revision_id, doc.source.id);
  const trace = await request<{ events: { event_type: string }[] }>(`/extractions/${job.id}/events`, 200);
  assert.equal(trace.events.length, 11);
  assert.equal(trace.events.at(-1)?.event_type, "completed");
  const steps = await request<{ steps: { step_key: string; status: string; duration_ms: string }[] }>(`/extractions/${job.id}/steps`, 200);
  assert.deepEqual(steps.steps.map(({ step_key }) => step_key), ["validate_source", "extract", "validate_output", "persist"]);
  assert.ok(steps.steps.every((step) => step.status === "succeeded" && step.duration_ms != null && Number(step.duration_ms) >= 0));

  const secondDoc = await save(portfolioSource);
  assert.equal((await request(mockRoute, 409, {
    method: "POST", body: { ...submission(secondDoc), idempotency_key: body.idempotency_key },
  })).error, "IDEMPOTENCY_CONFLICT");
  const portfolio = await enqueue(submission(secondDoc));
  await processOne(mock(portfolioPlan()), portfolio.id);
  const distinct = await detail(portfolio.id);
  assert.notEqual(distinct.graph.goal?.text, original.graph.goal?.text);
  assert.deepEqual(distinct.graph, validateActionThread(JSON.stringify(portfolioPlan()), portfolioSource));
  assert.equal((await request<{ threads: unknown[] }>(route, 200)).threads.length, 2);
  assert.equal((await request<{ threads: unknown[] }>(route, 200, { user: 1 })).threads.length, 0);
  for (const suffix of ["", "/progress"]) await request(`${route}/${job.id}${suffix}`, 404, { user: 1 });
  await request(`/extractions/${job.id}/events`, 404, { user: 1 });

  await request(`/documents/${doc.id}`, 200, { method: "PATCH", body: { version: doc.version, source_text: "A revised brain dump." } });
  assert.equal((await detail(job.id)).source_revision_id, doc.source.id);
  assert.deepEqual((await detail(job.id)).graph, original.graph);
  await assert.rejects(pool.query("UPDATE threadline_source_revisions SET source_text='Mutated' WHERE id=$1", [doc.source.id]), { code: "23514" });
  await assert.rejects(pool.query("UPDATE threadline_action_thread_nodes SET title='Mutated' WHERE thread_id=$1", [job.id]), { code: "23514" });
  await assert.rejects(pool.query("INSERT INTO threadline_action_thread_edges VALUES($1,$2,'derive-basics','review',20,'next',NULL,NULL)", [job.id, users[1]]), { code: "23503" });

  const approve = withVersion({ operation: "approve" }, 0);
  await post(job.id, approve, 404, 1);
  const approved = await Promise.all([post(job.id, approve), post(job.id, approve)]);
  assert.deepEqual(approved.map(({ replayed }) => replayed).sort(), [false, true]);
  let calc = approved[0].progress;
  assert.equal(calc.version, 1);
  assert.equal((await post<{ error: string }>(job.id, { ...approve, operation: "reject" }, 409)).error, "THREAD_IDEMPOTENCY_CONFLICT");
  const skip = withVersion({ operation: "complete", node_id: "independent-set" }, calc.version);
  assert.equal((await post<{ error: string }>(job.id, skip, 409)).error, "THREAD_NODE_NOT_ACTIVE");
  calc = await complete(job.id, calc, "derive-basics");
  calc = await complete(job.id, calc, "manipulate-series");
  calc = await complete(job.id, calc, "independent-set");
  assert.equal((await post<{ error: string }>(job.id,
    withVersion({ operation: "decide", node_id: "check-mastery", to_node_id: "mixed-practice" }, calc.version), 409)).error, "THREAD_INVALID_OUTCOME");
  calc = await decide(job.id, calc, "check-mastery", "diagnose-errors");
  calc = await change(job.id, calc, { operation: "block", node_id: "diagnose-errors", note: "Check the derivative rule again." });
  assert.equal(calc.active_node_id, "diagnose-errors");
  assert.deepEqual((await progress(job.id)).active_next_steps[0].allowed_operations, ["complete", "retry", "block"]);
  const firstRetry = withVersion({ operation: "retry", node_id: "diagnose-errors" }, calc.version);
  const contenders = await Promise.all([
    post(job.id, firstRetry),
    post(job.id, firstRetry),
  ]);
  assert.deepEqual(contenders.map(({ replayed }) => replayed).sort(), [false, true]);
  calc = contenders[0].progress;
  assert.equal((await post<{ error: string }>(job.id, { ...firstRetry, idempotency_key: randomUUID() }, 409)).error, "THREAD_VERSION_CONFLICT");

  const beforeRestart = await progress(job.id);
  await stopServer();
  await startServer();
  assert.deepEqual(await progress(job.id), beforeRestart);
  assert.deepEqual(await request(`/extractions/${job.id}/events`, 200), trace);
  calc = await complete(job.id, calc, "independent-set");
  calc = await decide(job.id, calc, "check-mastery", "diagnose-errors");
  assert.deepEqual((await progress(job.id)).active_next_steps[0].retry, {
    to: "independent-set", used: 1, remaining: 1, limit: 2,
  });
  calc = await change(job.id, calc, { operation: "retry", node_id: "diagnose-errors" });
  calc = await complete(job.id, calc, "independent-set");
  calc = await decide(job.id, calc, "check-mastery", "diagnose-errors");
  assert.deepEqual((await progress(job.id)).active_next_steps[0].allowed_operations, ["complete", "block"]);
  assert.equal((await post<{ error: string }>(job.id,
    withVersion({ operation: "retry", node_id: "diagnose-errors" }, calc.version), 409)).error, "THREAD_RETRY_EXHAUSTED");
  calc = await complete(job.id, calc, "diagnose-errors");
  assert.equal(calc.active_node_id, "request-feedback");
  assert.equal((await complete(job.id, calc, "request-feedback")).state, "completed");
  assert.equal((await progress(job.id)).events.filter(({ operation }) => operation === "retry").length, 2);
  assert.deepEqual((await detail(job.id)).graph, original.graph);

  const pass = await enqueue(submission(await save(calcSource)));
  await processOne(mock(calcPlan()), pass.id);
  let passState = (await post(pass.id, approve)).progress;
  for (const node of ["derive-basics", "manipulate-series", "independent-set"]) passState = await complete(pass.id, passState, node);
  passState = await decide(pass.id, passState, "check-mastery", "cover-remaining");
  passState = await complete(pass.id, passState, "cover-remaining");
  assert.equal((await complete(pass.id, passState, "mixed-practice")).state, "completed");

  const voluntary = await enqueue(submission(await save(calcSource)));
  await processOne(mock(calcPlan()), voluntary.id);
  let exitState = (await post(voluntary.id, approve)).progress;
  for (const node of ["derive-basics", "manipulate-series", "independent-set"]) exitState = await complete(voluntary.id, exitState, node);
  exitState = await decide(voluntary.id, exitState, "check-mastery", "diagnose-errors");
  exitState = await complete(voluntary.id, exitState, "diagnose-errors");
  assert.equal(exitState.active_node_id, "request-feedback");
  assert.equal((await complete(voluntary.id, exitState, "request-feedback")).state, "completed");
  assert.equal((await progress(voluntary.id)).events.filter(({ operation }) => operation === "retry").length, 0);

  let site = (await post(portfolio.id, approve)).progress;
  site = await complete(portfolio.id, site, "inventory");
  site = await decide(portfolio.id, site, "check-rights", "use-text");
  site = await complete(portfolio.id, site, "use-text");
  assert.equal(site.active_node_id, "review");
  assert.equal((await complete(portfolio.id, site, "review")).state, "completed");

  const rejected = await enqueue(submission(await save(portfolioSource)));
  await processOne(mock(portfolioPlan()), rejected.id);
  const rejectedState = (await post(rejected.id, withVersion({ operation: "reject" }, 0))).progress;
  assert.equal(rejectedState.state, "rejected");
  assert.equal((await post<{ error: string }>(rejected.id,
    withVersion({ operation: "complete", node_id: "inventory" }, 1), 409)).error, "THREAD_INACTIVE");

  const invalid = await enqueue(submission(await save(calcSource)));
  const graph = calcPlan();
  graph.edges[0].to = "missing-node";
  await processOne(mock(graph), invalid.id);
  await failed(invalid.id, "failed", "DANGLING_THREAD_EDGE");

  const rollback = await enqueue(submission(await save(calcSource)));
  await pool.query(`CREATE FUNCTION fixture_reject_edge() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic edge failure'; END $$;
    CREATE TRIGGER fixture_reject_edge BEFORE INSERT ON threadline_action_thread_edges
      FOR EACH ROW EXECUTE FUNCTION fixture_reject_edge()`);
  await processOne(mock(calcPlan()), rollback.id);
  await failed(rollback.id, "failed", "STORAGE_OR_PROCESSING_FAILURE");
  await pool.query("DROP TRIGGER fixture_reject_edge ON threadline_action_thread_edges");

  const providerFailure = await enqueue(submission(await save(calcSource)));
  await processOne({ mode: "mock", async generate() { throw new ExtractionError("PROVIDER_REJECTED"); } }, providerFailure.id);
  await failed(providerFailure.id, "failed", "PROVIDER_REJECTED");

  const cancelled = await enqueue(submission(await save(calcSource)));
  let signalStarted = () => {};
  let releaseResponse = (_raw: string) => {};
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const response = new Promise<string>((resolve) => { releaseResponse = resolve; });
  const processing = processOne({
    mode: "mock",
    generate() { signalStarted(); return response; },
  }, cancelled.id);
  await Promise.race([started, processing.then(() => assert.fail("Adapter was not started"))]);
  try {
    await request(`/extractions/${cancelled.id}/cancel`, 200, { method: "POST", body: {} });
  } finally {
    releaseResponse(JSON.stringify(calcPlan()));
    await processing;
  }
  await failed(cancelled.id, "cancelled");

  const stale = await enqueue(submission(await save(calcSource)));
  const lease = await claim("mock", stale.id);
  assert.ok(lease);
  await pool.query("UPDATE threadline_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [stale.id]);
  assert.equal(await recoverExpired(), 1);
  assert.equal(await recoverExpired(), 0);
  assert.equal(await finish(lease, original.graph), false);
  await failed(stale.id, "interrupted", "OUTCOME_UNCERTAIN");

  const timeout = await enqueue(submission(await save(calcSource)));
  await processOne({ mode: "mock", generate: () => new Promise(() => {}) }, timeout.id);
  await failed(timeout.id, "failed", "PROVIDER_TIMEOUT");

  const latest = (await save(calcSource)).source.id;
  const live = await extract(users[0], latest, randomUUID(), "gemini", 3, grant.id);
  assert.equal(await processOne(gemini, live.id), false);
  await failed(live.id, "failed", "THREAD_LIVE_DISABLED");
  await assert.rejects(gemini.generate(calcSource, undefined, 3, latest, { id: live.id, lease_token: randomUUID(), user_id: users[0] }),
    { code: "THREAD_LIVE_DISABLED" });
  const wire = actionThreadRequest(calcSource);
  assert.equal(wire.generationConfig.maxOutputTokens, 4096);
  assert.equal(tokenReservation(calcSource, 3),
    Buffer.byteLength(JSON.stringify(wire)) + wire.generationConfig.maxOutputTokens + 2048);
  assert.equal((await pool.query("SELECT used FROM threadline_beta_grant")).rows[0].used, 0);

  const originalDirectory = process.cwd();
  const privateDirectory = mkdtempSync(join(tmpdir(), "threadline-v3-integration-"));
  try {
    process.chdir(privateDirectory);
    mkdirSync(".local", { mode: 0o700 });
    delete process.env.THREADLINE_GEMINI_LIVE_AUTHORIZED;
    delete process.env.THREADLINE_GEMINI_FREE_TIER_APPROVAL;
    process.env.NODE_ENV = "development";
    process.env.GEMINI_API_KEY = "offline-v3-integration-fixture";
    const config = {
      liveAuthorized: true, schemaVersion: 3, approval: {
        project: "threadline-gemini", model: MODEL,
        keySha256: createHash("sha256").update(process.env.GEMINI_API_KEY).digest("hex"),
        startsAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 3600000),
      },
    };
    const switchFile = ".local/threadline-gemini-authorization.json";
    const setSwitch = (liveAuthorized: boolean) =>
      writeFileSync(switchFile, JSON.stringify({ ...config, liveAuthorized }), { mode: 0o600 });
    setSwitch(true);
    const submitLive = (body: ReturnType<typeof submission>, status = 202, user = 0) =>
      request<Job & { error?: string }>(route, status, { method: "POST", body, user });
    const availability = (source: string, user = 0) =>
      request<{ enabled: boolean; reason?: string }>(`${route}/availability?source_revision_id=${source}`, 200, { user });
    assert.deepEqual(await availability(latest), { enabled: true });
    assert.equal((await availability(foreign.source_revision_id, 1)).reason, "BETA_UNAVAILABLE");
    assert.equal((await submitLive(foreign, 403, 1)).error, "BETA_UNAVAILABLE");
    await submitLive(body, 404, 1);
    await submitLive({ ...body, consent: false }, 400);
    await pool.query("UPDATE threadline_beta_grant SET starts_at=now()-interval '1 hour', expires_at=now()-interval '1 second'");
    assert.equal((await submitLive(body, 403)).error, "BETA_UNAVAILABLE");
    await pool.query("UPDATE threadline_beta_grant SET expires_at=now()+interval '1 hour', used=request_limit");
    assert.equal((await submitLive({ ...body, idempotency_key: randomUUID() }, 429)).error, "BETA_LIMIT");
    await pool.query("UPDATE threadline_beta_grant SET used=0,request_limit=100");

    const paused = await submitLive(submission(await save(calcSource)));
    setSwitch(false);
    assert.equal(await processOne(gemini, paused.id), false);
    await failed(paused.id, "failed", "THREAD_LIVE_DISABLED");
    setSwitch(true);
    const submissions = await Promise.all(Array.from({ length: 4 }, async () => submission(await save(calcSource))));
    const [valid, same] = await Promise.all([submitLive(submissions[0]), submitLive(submissions[0])]);
    assert.deepEqual(same, valid);
    assert.equal((await submitLive({ ...submissions[0], idempotency_key: randomUUID() }, 409)).error, "THREAD_REQUEST_EXISTS");
    const bad = await submitLive(submissions[1]);
    const truncated = await submitLive(submissions[2]);
    assert.equal((await submitLive(submissions[3], 429)).error, "THREAD_EVALUATION_LIMIT");
    const broken = calcPlan();
    broken.edges[0].to = "missing-node";
    const candidates = [
      { finishReason: "STOP", content: { parts: [{ text: JSON.stringify(calcPlan()) }] } },
      { finishReason: "STOP", content: { parts: [{ text: JSON.stringify(broken) }] } },
      { finishReason: "MAX_TOKENS" },
    ];
    let sends = 0;
    providerFixture = (init) => {
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), wire);
      assert.ok(sends < candidates.length, "No duplicate or over-budget provider dispatch");
      return Response.json({ candidates: [candidates[sends++]] });
    };
    for (const job of [valid, bad, truncated]) {
      assert.equal(await processOne(gemini, job.id), true);
      assert.equal(await processOne(gemini, job.id), false);
      await pool.query("UPDATE threadline_execution_steps SET started_at=now()-interval '7 seconds' WHERE run_id=$1 AND step_key='extract'", [job.id]);
    }
    assert.deepEqual((await detail(valid.id)).graph, original.graph);
    assert.equal((await detail(valid.id)).provider, "gemini");
    await failed(bad.id, "failed", "DANGLING_THREAD_EDGE");
    await failed(truncated.id, "failed", "PROVIDER_OUTPUT_LIMIT");
    assert.deepEqual(await submitLive(submissions[0]), { ...valid, status: "succeeded" });
    assert.equal((await availability(submissions[3].source_revision_id)).reason, "THREAD_EVALUATION_LIMIT");
    const overBudget = await enqueue(submissions[3]);
    await pool.query("UPDATE threadline_runs SET provider='gemini',consent_grant_id=$2 WHERE id=$1", [overBudget.id, grant.id]);
    assert.equal(await processOne(gemini, overBudget.id), true);
    await failed(overBudget.id, "failed", "THREAD_EVALUATION_LIMIT");
    assert.equal(sends, 3);
    assert.equal((await pool.query("SELECT used FROM threadline_beta_grant")).rows[0].used, 3);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM threadline_runs WHERE beta_dispatched_at IS NOT NULL")).rows[0].count, 3);
    console.log("PASS: live v3 route and real adapter with stub transport, owner/expiry/quota checks, immediate disable, exactly three debits, complete graph, rejected graph, and output ceiling");
  } finally {
    providerFixture = undefined;
    process.chdir(originalDirectory);
    rmSync(privateDirectory, { recursive: true, force: true });
  }
  process.env.NODE_ENV = "production";
  delete process.env.THREADLINE_PRODUCTION_AI_APPROVED;
  const prodInputs = await Promise.all([0, 0, 0, 1, 1, 1].map(async (user) => submission(await save(calcSource, user))));
  const prodSubmit = (index: number, status = 202, user = index < 3 ? 0 : 1) =>
    request<Job & { error?: string }>(route, status, { method: "POST", user, body: prodInputs[index] });
  assert.equal((await prodSubmit(0, 503)).error, "THREAD_LIVE_DISABLED");
  process.env.THREADLINE_PRODUCTION_AI_APPROVED = "true";
  process.env.THREADLINE_PRODUCTION_GEMINI_API_KEY = "offline-production-fixture";
  assert.equal((await prodSubmit(0, 503)).error, "PRODUCTION_AI_UNCONFIGURED");
  process.env.THREADLINE_PRODUCTION_GEMINI_KEY_SHA256 = createHash("sha256").update("offline-production-fixture").digest("hex");
  process.env.THREADLINE_PRODUCTION_AI_SUBJECTS = users[0];
  process.env.THREADLINE_PRODUCTION_AI_DAILY = "4";
  process.env.THREADLINE_PRODUCTION_AI_RPM = "2";
  process.env.THREADLINE_PRODUCTION_AI_TPM = "60000";
  assert.equal((await prodSubmit(3, 403)).error, "PRODUCTION_AI_COHORT");
  await request(route, 401, { method: "POST", user: null, body: prodInputs[0] });
  await request(route, 400, { method: "POST", body: { ...prodInputs[0], consent: false } });
  await request(route, 404, { method: "POST", body: prodInputs[3] });
  process.env.THREADLINE_PRODUCTION_AI_SUBJECTS = users.join(",");
  // Ignore only fixture development reservations when testing production quotas.
  await pool.query("UPDATE threadline_execution_steps SET started_at=now()-interval '2 days' WHERE reserved_tokens IS NOT NULL");
  const [first, concurrentReplay, second] = await Promise.all([prodSubmit(0), prodSubmit(0), prodSubmit(3)]);
  assert.equal(first.id, concurrentReplay.id);
  assert.equal((await prodSubmit(1, 429)).error, "QUEUE_FULL");
  const [primary, competing] = await Promise.all([claim("gemini", first.id), claim("gemini", second.id)]);
  assert.equal(Number(!!primary) + Number(!!competing), 1);
  const claimToRun = primary ?? competing!;
  let productionCalls = 0;
  providerFixture = (init) => {
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "offline-production-fixture");
    productionCalls++;
    return productionCalls === 1 ? new Response("", { status: 503 })
      : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(calcPlan()) }] } }] });
  };
  await assert.rejects(gemini.generate(calcSource, undefined, 3, claimToRun.source_revision_id, {
    ...claimToRun, user_id: users.find(user => user !== claimToRun.user_id)!,
  }), { code: "PRODUCTION_AI_CONSENT" });
  delete process.env.THREADLINE_PRODUCTION_AI_APPROVED;
  await assert.rejects(gemini.generate(calcSource, undefined, 3, claimToRun.source_revision_id, claimToRun),
    { code: "THREAD_LIVE_DISABLED" });
  assert.equal(productionCalls, 0);
  process.env.THREADLINE_PRODUCTION_AI_APPROVED = "true";
  let firstError: unknown;
  try {
    await gemini.generate(calcSource, undefined, 3, claimToRun.source_revision_id, claimToRun);
  } catch (error) { firstError = error; }
  assert.ok(firstError instanceof ExtractionError && firstError.code === "PROVIDER_TRANSIENT");
  await assert.rejects(gemini.generate(calcSource, undefined, 3, claimToRun.source_revision_id, claimToRun),
    { code: "PRODUCTION_AI_CONSENT" });
  const { fail } = await import("../extraction/worker");
  await fail(claimToRun, firstError);
  await failed(claimToRun.id, "failed", "PROVIDER_TRANSIENT", users.indexOf(claimToRun.user_id));
  assert.equal(await processOne(gemini, claimToRun.id), false);
  const pending = claimToRun.id === first.id ? second : first;
  assert.equal(await processOne(gemini, pending.id), false, "enforce minimum dispatch spacing");
  await pool.query("UPDATE threadline_execution_steps SET started_at=now()-interval '7 seconds' WHERE run_id=$1 AND step_key='extract'", [claimToRun.id]);
  process.env.THREADLINE_PRODUCTION_AI_TPM = String(tokenReservation(calcSource, 3));
  assert.equal(await processOne(gemini, pending.id), false, "enforce project TPM");
  process.env.THREADLINE_PRODUCTION_AI_TPM = "60000";
  assert.equal(await processOne(gemini, pending.id), true);
  assert.equal((await detail(pending.id, pending.id === first.id ? 0 : 1)).provider, "gemini");
  const third = await prodSubmit(1);
  assert.equal(await processOne(gemini, third.id), false, "initially not spaced");
  await pool.query("UPDATE threadline_execution_steps SET started_at=GREATEST(now()-interval '7 seconds', (date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles')) WHERE run_id=$1 AND step_key='extract'", [pending.id]);
  assert.equal(await processOne(gemini, third.id), false, "enforce project RPM");
  // Move the first two fixture reservations outside the RPM window while retaining daily accounting.
  await pool.query("UPDATE threadline_execution_steps SET started_at=now()-interval '61 seconds' WHERE run_id=ANY($1::uuid[]) AND step_key='extract'", [[first.id, second.id]]);
  assert.equal(await processOne(gemini, third.id), true);
  assert.equal((await prodSubmit(2, 429)).error, "DAILY_QUOTA");
  const fourth = await prodSubmit(4);
  assert.equal((await prodSubmit(5, 429)).error, "DAILY_QUOTA");
  await pool.query("UPDATE threadline_execution_steps SET started_at=now()-interval '7 seconds' WHERE run_id=$1 AND step_key='extract'", [third.id]);
  assert.equal(await processOne(gemini, fourth.id), true);
  assert.equal(productionCalls, 4);
  assert.equal((await pool.query("SELECT count(*)::int n FROM threadline_runs WHERE production_dispatched_at IS NOT NULL")).rows[0].n, 4);
  assert.equal((await pool.query("SELECT used FROM threadline_beta_grant")).rows[0].used, 3);
  providerFixture = undefined;
  console.log("PASS: production cohort, consent, private key binding, deduplication, queue and dispatch quotas, exclusive leases, validation, and no uncertain resend through offline transport");
  assert.equal((await pool.query("SELECT 1 FROM focus_tasks")).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM threadline_knowledge_blocks")).rowCount, 0);
  console.log("PASS: authenticated v3 persistence, Calc 2 branches, alternative-path convergence, cumulative retry, restart, concurrency, ownership, provenance, atomic rollback, trace, provider error, cancellation, timeout, recovery and closed live gate");
  await stopServer();
  const erase = spawnSync(process.execPath, [
    new URL("../../../../lib/db/scripts/account-data.mjs", import.meta.url).pathname, "delete", "--confirm-delete",
  ], { env: { ...process.env, THREADLINE_ACCOUNT_SUBJECT: users[0] }, encoding: "utf8", timeout: 30_000 });
  assert.equal(erase.status, 0, erase.stderr);
  assert.equal((await pool.query("SELECT 1 FROM threadline_action_threads WHERE user_id=$1", [users[0]])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM threadline_action_thread_transitions WHERE user_id=$1", [users[0]])).rowCount, 0);
  assert.ok((await pool.query("SELECT 1 FROM threadline_action_threads WHERE user_id=$1", [users[1]])).rowCount);
  console.log("PASS: erasure cascades through saved graphs and transitions and preserves the other account");
} finally {
  globalThis.fetch = originalFetch;
  if (server) await stopServer();
  if (schemaCreated) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
