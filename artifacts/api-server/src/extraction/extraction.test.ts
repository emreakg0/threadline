import { readFileSync } from "node:fs";
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
  ProviderRequestError,
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
  evidence: ["Call Sam tomorrow"],
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
assert.deepEqual(validate(planOutput(), source, 2)[0].evidence, block.evidence);
for (const [text, evidence, code] of [
  [source, ["call Sam tomorrow"], "QUOTE_NOT_FOUND"],
  [source, ["Call  Sam tomorrow"], "QUOTE_NOT_FOUND"],
  [source, ["Call Sam tomorrow."], "QUOTE_NOT_FOUND"],
  ["é", ["e\u0301"], "QUOTE_NOT_FOUND"],
  ["aaaa", ["aaa"], "AMBIGUOUS_QUOTE"],
  [source, [" "], "EMPTY_EVIDENCE"],
  [source, [], "EMPTY_EVIDENCE"],
  [
    source,
    [{ quote: "Call Sam tomorrow", start: 3, end: 20 }],
    "INVALID_EVIDENCE",
  ],
  [source, ["Sam"], "UNSUPPORTED_DEADLINE"],
] as const)
  assert.throws(
    () => validate(planOutput({ ...proposed, evidence }), text, 2),
    (e: ExtractionError) => e.code === code && e.message === code,
  );
const unicode = validate(
  planOutput({ ...proposed, evidence: ["🧵 tomorrow"] }),
  "🎈🧵 tomorrow",
  2,
);
assert.deepEqual(unicode[0].evidence, [
  { quote: "🧵 tomorrow", start: 1, end: 11 },
]);
assert.throws(
  () => validate("{", source, 2),
  (e: ExtractionError) => e.code === "INVALID_JSON",
);
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
  JSON.stringify(request),
  readFileSync(
    new URL("./fixtures/planning-request.json", import.meta.url),
    "utf8",
  ).trimEnd(),
);
assert.equal(request.generationConfig.maxOutputTokens, 4096);
assert.deepEqual(
  request.generationConfig.responseJsonSchema.properties.schema_version.enum,
  [2],
);
assert.doesNotMatch(
  JSON.stringify(request.generationConfig.responseJsonSchema),
  /"(?:minItems|maxItems|maxLength)":/,
);
for (const blocks of [
  Array(25).fill(proposed),
  [{ ...proposed, evidence: Array(9).fill(proposed.evidence[0]) }],
  [{ ...proposed, evidence: [] }],
  [
    {
      ...proposed,
      proposal: { ...proposed.proposal, description: "x".repeat(1201) },
    },
  ],
])
  assert.throws(() =>
    validate(JSON.stringify({ schema_version: 2, blocks }), source, 2),
  );

const secretEcho = "untrusted echoed source";
const badRequest = Response.json(
  {
    error: {
      status: "INVALID_ARGUMENT",
      message: secretEcho,
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.BadRequest",
          fieldViolations: [
            {
              field:
                "generation_config.response_json_schema.properties." +
                secretEcho,
              description: secretEcho,
            },
            { field: secretEcho },
            { field: "contents[0].parts[0].text" },
          ],
        },
      ],
    },
  },
  { status: 400 },
);
for (const [response, expected] of [
  [
    badRequest,
    {
      httpStatus: 400,
      googleStatus: "INVALID_ARGUMENT",
      fields: ["generationConfig.responseJsonSchema", "contents"],
    },
  ],
  [
    Response.json(
      {
        error: {
          status: secretEcho,
          details: [{ fieldViolations: [{ field: "contents" }] }],
        },
      },
      { status: 400 },
    ),
    { httpStatus: 400 },
  ],
  [new Response("{", { status: 400 }), { httpStatus: 400 }],
  [
    Response.json(
      { error: { status: "INVALID_ARGUMENT", message: "x".repeat(9000) } },
      { status: 400 },
    ),
    { httpStatus: 400 },
  ],
  [
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(Error(secretEcho));
        },
      }),
      { status: 400 },
    ),
    { httpStatus: 400 },
  ],
  [new Response(new ReadableStream(), { status: 400 }), { httpStatus: 400 }],
] as const)
  await assert.rejects(readPlanningResponse(response), (error) => {
    assert.ok(error instanceof ProviderRequestError);
    assert.equal(error.code, "PROVIDER_REJECTED");
    assert.deepEqual(error.diagnostic, expected);
    assert.ok(!JSON.stringify(error).includes(secretEcho));
    return true;
  });
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
  const conditional =
    "If the quiz moves to Thursday, review calculus. Review calculus was last week's topic.";
  const scenarios = [
    {
      source: conditional,
      blocks: [
        {
          ...proposed,
          content: "Review calculus if the quiz moves",
          uncertainty_reason: "The quiz date may change.",
          evidence: ["If the quiz moves to Thursday, review calculus."],
          proposal: { ...proposed.proposal, deadline_phrase: "Thursday" },
        },
      ],
    },
    { source: "It rained this morning.", blocks: [] },
  ];
  for (const scenario of scenarios) {
    const d = randomUUID(),
      rev = randomUUID();
    await pool.query(
      "INSERT INTO threadline_documents(id,user_id,title) VALUES($1,$2,'Scenario')",
      [d, user],
    );
    await pool.query(
      "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,1,$4)",
      [rev, user, d, scenario.source],
    );
    const simulated = await enqueue(user, rev, randomUUID(), "mock", 2);
    await processOne(
      {
        mode: "mock",
        generate: async () =>
          JSON.stringify({ schema_version: 2, blocks: scenario.blocks }),
      },
      simulated.id,
    );
    const saved = await pool.query(
      "SELECT review_state,uncertainty_reason,schedule,due_date FROM threadline_plan_actions a JOIN threadline_knowledge_blocks b ON b.id=a.block_id WHERE b.originating_run_id=$1",
      [simulated.id],
    );
    assert.equal(
      (
        await pool.query("SELECT status FROM threadline_runs WHERE id=$1", [
          simulated.id,
        ])
      ).rows[0].status,
      "succeeded",
    );
    assert.equal(saved.rowCount, scenario.blocks.length);
    if (saved.rowCount)
      assert.deepEqual(saved.rows[0], {
        review_state: "needs_review",
        uncertainty_reason: scenario.blocks[0].uncertainty_reason,
        schedule: "unresolved",
        due_date: null,
      });
  }
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
        "SELECT count(*)::int n FROM threadline_knowledge_blocks WHERE document_id=$1",
        [doc],
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
