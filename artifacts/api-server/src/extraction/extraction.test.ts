import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { validate, ExtractionError } from "./validation";
import {
  ENDPOINT,
  MODEL,
  gemini,
  planningRequest,
  readPlanningResponse,
  ProviderQuotaError,
  tokenReservation,
} from "./gemini";
const source = "🧵 Call Sam tomorrow";
const block = {
  kind: "deadline",
  content: "Call Sam tomorrow",
  uncertainty_reason: "Relative date needs confirmation",
  evidence: [{ quote: "Call Sam tomorrow", start: 2, end: 19 }],
};
const output = (b: object = block) =>
  JSON.stringify({ schema_version: 1, blocks: [b] });
assert.equal(validate(output(), source).length, 1);
for (const raw of [
  "{",
  output({ ...block, kind: "other" }),
  output({ ...block, uncertainty_reason: null }),
  output({ ...block, content: "Invented decision" }),
  output({
    ...block,
    evidence: [{ quote: "Call Sam tomorrow", start: 3, end: 20 }],
  }),
  output({ ...block, extra: true }),
])
  assert.throws(() => validate(raw, source));
const proposed = {
  ...block,
  kind: "action",
  content: "Contact Sam",
  proposal: {
    description: null,
    category: "Follow-ups",
    suggested_priority: null,
    deadline_phrase: "tomorrow",
  },
};
const planOutput = (entry: object = proposed) =>
  JSON.stringify({ schema_version: 2, blocks: [entry] });
assert.equal(validate(planOutput(), source, 2)[0].content, "Contact Sam");
assert.throws(() => validate(planOutput(), source)); // Version one never accepts v2.
for (const entry of [
  { ...proposed, content: "x".repeat(301) },
  { ...proposed, proposal: { ...proposed.proposal, due_date: "2026-11-19" } },
  {
    ...proposed,
    proposal: { ...proposed.proposal, deadline_phrase: "next week" },
  },
  {
    ...proposed,
    proposal: { ...proposed.proposal, suggested_priority: "highest" },
  },
  {
    ...proposed,
    evidence: [{ quote: "Call Sam tomorrow", start: 3, end: 20 }],
  },
])
  assert.throws(() => validate(planOutput(entry), source, 2));
const request = planningRequest(source);
assert.equal(MODEL, "gemini-3.5-flash-lite");
assert.equal(
  ENDPOINT,
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
);
assert.deepEqual(Object.keys(request).sort(), [
  "contents",
  "generationConfig",
  "systemInstruction",
]);
assert.equal(request.contents[0].parts[0].text, source);
assert.equal(request.generationConfig.responseMimeType, "application/json");
assert.equal(
  request.generationConfig.responseJsonSchema.properties.schema_version.minimum,
  2,
);
assert.ok(tokenReservation("🧵") > tokenReservation("x"));
const providerResult = Response.json({
  candidates: [
    {
      finishReason: "STOP",
      content: {
        parts: [{ thought: true, text: "private" }, { text: planOutput() }],
      },
    },
  ],
});
assert.equal(
  validate(await readPlanningResponse(providerResult), source, 2)[0].content,
  "Contact Sam",
);
for (const [response, code] of [
  [new Response("private", { status: 404 }), "MODEL_UNAVAILABLE"],
  [new Response("private", { status: 403 }), "PROVIDER_AUTH"],
  [new Response("private", { status: 503 }), "PROVIDER_TRANSIENT"],
  [new Response("{"), "INVALID_JSON"],
  [
    Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    "PROVIDER_SAFETY_OR_TRUNCATION",
  ],
  [
    Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    "PROVIDER_SAFETY_OR_TRUNCATION",
  ],
  [
    Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: {} } }],
    }),
    "INVALID_OUTPUT",
  ],
] as const)
  await assert.rejects(readPlanningResponse(response), { code });
await assert.rejects(
  readPlanningResponse(
    new Response(null, { status: 429, headers: { "retry-after": "120" } }),
  ),
  (error) =>
    error instanceof ProviderQuotaError && error.retryAfterSeconds === 120,
);
await assert.rejects(
  gemini.generate(source),
  (e: ExtractionError) => e.code === "LIVE_DISABLED",
);
const schema = "extraction_test_" + randomUUID().replaceAll("-", "");
process.env.PGOPTIONS = `-c search_path=${schema}`;
const { pool } = await import("@workspace/db");
const { extract: enqueue } = await import("./service");
const { processOne } = await import("./worker");
async function extract(
  user: string,
  source: string,
  key: string,
  adapter: import("./gemini").Adapter,
) {
  const run = await enqueue(user, source, key, adapter.mode);
  if (run.status === "queued") {
    await processOne(adapter, run.id);
    const r = (
      await pool.query("SELECT * FROM threadline_runs WHERE id=$1", [run.id])
    ).rows[0];
    if (r.status === "queued") {
      await new Promise((r) => setTimeout(r, 1100));
      await processOne(adapter, run.id);
    }
  }
  return (
    await pool.query("SELECT * FROM threadline_runs WHERE id=$1", [run.id])
  ).rows[0];
}
const user = "extraction-" + randomUUID(),
  foreign = "foreign-" + randomUUID(),
  doc = randomUUID(),
  revision = randomUUID();
let calls = 0;
const mock = {
  mode: "mock" as const,
  generate: async () => {
    calls++;
    return output();
  },
};
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const m = spawnSync(
    process.execPath,
    [
      new URL("../../../../lib/db/scripts/migrate.mjs", import.meta.url)
        .pathname,
    ],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(m.status, 0);
  await pool.query("INSERT INTO focus_users VALUES($1,$1,$1),($2,$2,$2)", [
    user,
    foreign,
  ]);
  await pool.query(
    "INSERT INTO threadline_documents(id,user_id,title) VALUES($1,$2,$3)",
    [doc, user, "Test"],
  );
  await pool.query(
    "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,1,$4)",
    [revision, user, doc, source],
  );
  await assert.rejects(
    extract(foreign, revision, "foreign-key", mock),
    (e: ExtractionError) => e.status === 404,
  );
  await assert.rejects(extract(user, randomUUID(), "missing-key", mock));
  const run = await extract(user, revision, "valid-key", mock);
  assert.equal(run.status, "succeeded");
  assert.equal(run.provider, "mock");
  assert.equal((await extract(user, revision, "valid-key", mock)).id, run.id);
  assert.equal(calls, 1);
  const saved = (await pool.query("SELECT * FROM threadline_knowledge_blocks"))
    .rows;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].review_state, "needs_review");
  const failure = await extract(user, revision, "invalid-key", {
    mode: "mock",
    generate: async () => "{",
  });
  assert.equal(failure.status, "failed");
  for (const code of [
    "PROVIDER_TIMEOUT",
    "MODEL_UNAVAILABLE",
    "PROVIDER_AUTH",
    "PROVIDER_TRANSIENT",
  ]) {
    const uid = "case-" + randomUUID();
    const d = randomUUID(),
      r = randomUUID();
    await pool.query("INSERT INTO focus_users VALUES($1,$1,$1)", [uid]);
    await pool.query(
      "INSERT INTO threadline_documents(id,user_id,title) VALUES($1,$2,$3)",
      [d, uid, "Case"],
    );
    await pool.query(
      "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,1,$4)",
      [r, uid, d, source],
    );
    const failed = await extract(uid, r, randomUUID(), {
      mode: "mock",
      generate: async () => {
        throw new ExtractionError(code);
      },
    });
    assert.equal(failed.error_code, code);
  }
  await pool.query(
    `CREATE FUNCTION reject_blocks() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_blocks BEFORE INSERT ON threadline_knowledge_blocks FOR EACH ROW EXECUTE FUNCTION reject_blocks()`,
  );
  const interrupted = await extract(user, revision, "storage-key", mock);
  assert.equal(interrupted.error_code, "STORAGE_OR_PROCESSING_FAILURE");
  await pool.query(
    "DROP TRIGGER reject_blocks ON threadline_knowledge_blocks; DROP FUNCTION reject_blocks()",
  );
  await pool.query(
    "UPDATE threadline_runs SET created_at=now()-interval '2 days' WHERE user_id=$1 AND id<>$2",
    [user, run.id],
  );
  const quota = await extract(user, revision, "quota-key", {
    mode: "mock",
    generate: async () => {
      throw new ExtractionError("QUOTA_EXHAUSTED", 429);
    },
  });
  assert.equal(quota.error_code, "QUOTA_EXHAUSTED");
  await assert.rejects(extract(foreign, revision, "another-key", mock));
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM threadline_knowledge_blocks",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await pool.query("SELECT source_text FROM threadline_source_revisions"))
      .rows[0].source_text,
    source,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM focus_tasks")).rows[0].n,
    0,
  );
  console.log(
    "PASS: strict JSON/evidence/emoji/deadline validation, disabled live gate, mock persistence, ownership, idempotency, failure/quota recording, needs_review, immutable source and no tasks",
  );
} finally {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
