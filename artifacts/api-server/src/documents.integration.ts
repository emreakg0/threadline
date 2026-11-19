import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// Every table/fixture lives in a new schema; no shared-schema migrations or OAuth calls.
const schema = `capture_test_${randomUUID().replaceAll("-", "")}`;
process.env.PGOPTIONS = `-c search_path=${schema}`;
process.env.APP_ORIGIN = "http://localhost:5173";
const { pool } = await import("@workspace/db");
const { default: app } = await import("./app");
let server: ReturnType<typeof app.listen> | undefined;
const users = [`capture-${randomUUID()}`, `capture-${randomUUID()}`];
const tokens = [
  randomBytes(32).toString("hex"),
  randomBytes(32).toString("hex"),
];
let base = "";
const headers = (owner = 0) => ({
  cookie: `focus_session=${tokens[owner]}`,
  origin: process.env.APP_ORIGIN!,
  "Content-Type": "application/json",
});
type TestJson = {
  status: string;
  events: { payload: unknown }[];
  runs: { id: string }[];
  source_text: string;
  id: string;
  version: number;
  source: { id: string; source_text: string; revision: number };
  archived_at: string | null;
  documents: { id: string }[];
  revisions: unknown[];
  collections: { id: string; name: string }[];
  tags: string[];
  blocks: {
    id: string;
    content: string;
    review_state: string;
    edited_at: string | null;
    evidence: unknown[];
  }[];
};
const request = (path: string, method = "GET", body?: unknown, owner = 0) =>
  fetch(base + path, {
    method,
    headers: headers(owner),
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as Promise<Omit<Response, "json"> & { json(): Promise<TestJson> }>;
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const migration = spawnSync(
    process.execPath,
    [new URL("../../../lib/db/scripts/migrate.mjs", import.meta.url).pathname],
    { env: process.env, encoding: "utf8", timeout: 60000 },
  );
  assert.equal(
    migration.status,
    0,
    "Isolated migrations failed (details suppressed)",
  );
  for (let i = 0; i < 2; i++) {
    await pool.query("INSERT INTO focus_users VALUES ($1,$2,$3)", [
      users[i],
      "Capture QA",
      "test@example.invalid",
    ]);
    await pool.query(
      "INSERT INTO focus_sessions VALUES ($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(tokens[i]).digest("hex"), users[i]],
    );
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api`;
  assert.equal((await fetch(base + "/documents")).status, 401);
  const id = randomUUID();
  const body = {
    id,
    title: "Meeting notes",
    source_text: "  Original source.\nDecide later. 🧵  ",
  };
  assert.equal(
    (
      await fetch(base + "/documents", {
        method: "POST",
        headers: { ...headers(), origin: "https://hostile.invalid" },
        body: JSON.stringify(body),
      })
    ).status,
    403,
  );
  for (const invalid of [
    null,
    [],
    {},
    { ...body, title: 7 },
    { ...body, title: " " },
    { ...body, title: "x".repeat(301) },
    { ...body, source_text: "" },
    { ...body, source_text: "x".repeat(20001) },
    { ...body, source_text: "\0" },
    { ...body, source_text: "\uD800" },
    { ...body, id: "bad" },
    { ...body, user_id: users[1] },
  ]) {
    assert.equal((await request("/documents", "POST", invalid)).status, 400);
  }
  assert.equal(
    (
      await request("/documents", "POST", {
        ...body,
        source_text: "\u0001".repeat(20000),
      })
    ).status,
    413,
  );
  let response = await request("/documents", "POST", body);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const initial = await response.json();
  assert.equal(initial.version, 1);
  assert.equal(initial.source.source_text, body.source_text);
  assert.equal(initial.source.revision, 1);
  response = await request("/documents", "POST", body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, id);
  assert.equal(
    (
      await request("/documents", "POST", {
        ...body,
        source_text: "Different retry",
      })
    ).status,
    409,
  );
  assert.equal((await request("/documents", "POST", body, 1)).status, 409);
  assert.equal((await request("/documents")).status, 200);
  assert.equal(
    (await (await request("/documents")).json()).documents[0].id,
    id,
  );
  assert.deepEqual(
    (await (await request("/documents", "GET", undefined, 1)).json()).documents,
    [],
  );
  for (const suffix of ["", "/revisions", "/revisions/1"])
    assert.equal(
      (await request(`/documents/${id}${suffix}`, "GET", undefined, 1)).status,
      404,
    );
  assert.equal(
    (
      await request(
        `/documents/${id}`,
        "PATCH",
        { version: 1, title: "Intruder" },
        1,
      )
    ).status,
    404,
  );
  for (const invalid of [
    { version: "1", title: "Bad" },
    { version: 0, title: "Bad" },
    { version: 1 },
    { version: 1, archived: "yes" },
    { version: 1, source_text: null },
    { version: 1, title: "" },
    { version: 1, collection_id: "invalid" },
    { version: 1, tags: [null] },
  ])
    assert.equal(
      (await request(`/documents/${id}`, "PATCH", invalid)).status,
      400,
    );
  assert.equal((await request("/documents?offset=-1")).status, 400);
  assert.equal((await request("/documents?archived=maybe")).status, 400);
  assert.equal((await request("/documents/not-an-id")).status, 400);
  assert.equal((await request(`/documents/${id}/revisions/0`)).status, 400);
  const updates = await Promise.all(
    ["Edited A", "Edited B"].map((source_text) =>
      request(`/documents/${id}`, "PATCH", {
        version: 1,
        title: "Edited title",
        source_text,
      }),
    ),
  );
  assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
  const current = await (await request(`/documents/${id}`)).json();
  assert.equal(current.version, 2);
  assert.equal(current.source.revision, 2);
  assert.equal(
    (await (await request(`/documents/${id}/revisions/1`)).json()).source_text,
    body.source_text,
  );
  assert.equal(
    (await (await request(`/documents/${id}/revisions`)).json()).revisions
      .length,
    2,
  );
  await assert.rejects(
    pool.query(
      "UPDATE threadline_source_revisions SET source_text=$1 WHERE document_id=$2",
      ["overwrite", id],
    ),
    (e: { code: string }) => e.code === "23514",
  );
  // A revision write failure must roll back title/version changes in the same transaction.
  await pool.query(`CREATE FUNCTION reject_capture_revision() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Injected test storage failure' USING ERRCODE='08006'; END $$;
    CREATE TRIGGER reject_capture_revision BEFORE INSERT ON threadline_source_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_capture_revision()`);
  assert.equal(
    (
      await request(`/documents/${id}`, "PATCH", {
        version: 2,
        title: "Must roll back",
        source_text: "Failed write",
      })
    ).status,
    503,
  );
  await pool.query(
    "DROP TRIGGER reject_capture_revision ON threadline_source_revisions; DROP FUNCTION reject_capture_revision()",
  );
  const afterFailure = await (await request(`/documents/${id}`)).json();
  assert.equal(afterFailure.version, 2);
  assert.equal(afterFailure.source.source_text, current.source.source_text);
  response = await request(`/documents/${id}`, "PATCH", {
    version: 2,
    title: "Only rename",
    source_text: current.source.source_text,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source.revision, 2);
  assert.equal(
    (await request(`/documents/${id}`, "PATCH", { version: 2, archived: true }))
      .status,
    409,
  );
  response = await request(`/documents/${id}`, "PATCH", {
    version: 3,
    archived: true,
  });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).archived_at);
  assert.deepEqual((await (await request("/documents")).json()).documents, []);
  assert.equal(
    (await (await request("/documents?archived=true")).json()).documents[0].id,
    id,
  );
  response = await request(`/documents/${id}`, "PATCH", {
    version: 4,
    archived: false,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).archived_at, null);
  const organization = "/documents/organization";
  const collection = await (
    await request(organization, "POST", { name: "Research" })
  ).json();
  const foreign = await (
    await request(organization, "POST", { name: "Private" }, 1)
  ).json();
  assert.deepEqual((await (await request(organization)).json()).collections, [
    { id: collection.id, name: "Research" },
  ]);
  const path = "/documents/" + id;
  assert.equal(
    (await request(path, "PATCH", { version: 5, collection_id: foreign.id }))
      .status,
    404,
  );
  response = await request(path, "PATCH", {
    version: 5,
    collection_id: collection.id,
    tags: [" planning ", "team", "planning"],
  });
  assert.equal(response.status, 200);
  const organized = await response.json();
  assert.deepEqual(organized.tags, ["planning", "team"]);
  assert.equal(organized.source.revision, 2);
  const filters = new URLSearchParams({
    q: current.source.source_text.toUpperCase(),
    tag: "planning",
    collection: collection.id,
  });
  assert.equal(
    (await (await request("/documents?" + filters)).json()).documents[0].id,
    id,
  );
  assert.deepEqual(
    (await (await request("/documents?" + filters, "GET", undefined, 1)).json())
      .documents,
    [],
  );
  assert.deepEqual(
    (await (await request("/documents?q=%25")).json()).documents,
    [],
  );
  assert.equal((await request("/documents?q=one&q=two")).status, 400);

  const block = randomUUID();
  await pool.query(
    `INSERT INTO threadline_knowledge_blocks(id,user_id,document_id,kind,position,content,uncertainty_reason)
     VALUES ($1,$2,$3,'note',0,'Original source.','Test uncertainty')`,
    [block, users[0], id],
  );
  await pool.query(
    `INSERT INTO threadline_block_evidence(id,user_id,block_id,document_id,source_revision_id,quote,start_offset,end_offset)
     VALUES ($1,$2,$3,$4,$5,'Original source.',2,18)`,
    [randomUUID(), users[0], block, id, initial.source.id],
  );
  const blocks = path + "/blocks";
  const blockPath = blocks + "/" + block;
  const [before] = (
    await (await request(blocks + "?kind=note&state=needs_review")).json()
  ).blocks;
  assert.equal(before.id, block);
  assert.equal(before.edited_at, null);
  assert.equal((await request(blocks, "GET", undefined, 1)).status, 404);
  assert.equal(
    (
      await request(
        blockPath,
        "PATCH",
        { version: 1, review_state: "confirmed" },
        1,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(blockPath, "PATCH", { version: 1, evidence: [] })).status,
    400,
  );
  const reviews = await Promise.all(
    ["Confirmed text A", "Confirmed text B"].map((content) =>
      request(blockPath, "PATCH", {
        version: 1,
        content,
        review_state: "confirmed",
      }),
    ),
  );
  assert.deepEqual(reviews.map((result) => result.status).sort(), [200, 409]);
  const [confirmed] = (
    await (await request(blocks + "?state=confirmed")).json()
  ).blocks;
  assert.ok(confirmed.edited_at);
  assert.deepEqual(confirmed.evidence, before.evidence);
  assert.equal(
    (
      await request(blockPath, "PATCH", {
        version: 2,
        review_state: "dismissed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(blockPath, "PATCH", {
        version: 3,
        content: "Revised wording",
      })
    ).status,
    200,
  );
  const [reopened] = (
    await (await request(blocks + "?state=needs_review")).json()
  ).blocks;
  assert.equal(reopened.content, "Revised wording");
  assert.deepEqual(reopened.evidence, before.evidence);
  assert.equal(
    (await (await request("/documents?review=true")).json()).documents[0].id,
    id,
  );
  const { extract } = await import("./extraction/service");
  const extractionBody = {
    source_revision_id: initial.source.id,
    idempotency_key: randomUUID(),
  };
  assert.deepEqual(await (await request("/extractions/availability")).json(), {
    enabled: false,
    reason: "LIVE_DISABLED",
  });
  assert.equal(
    (await request("/extractions", "POST", extractionBody)).status,
    503,
  );
  const recorded = await extract(
    users[0],
    initial.source.id,
    extractionBody.idempotency_key,
    "mock",
  );
  assert.equal(
    (await request("/extractions/" + recorded.id, "GET", undefined, 1)).status,
    404,
  );
  for (const suffix of ["/events", "/steps", "/progress"])
    assert.equal(
      (
        await request(
          "/extractions/" + recorded.id + suffix,
          "GET",
          undefined,
          1,
        )
      ).status,
      404,
    );
  assert.equal(
    (await request("/extractions/" + recorded.id + "/cancel", "POST", {}, 1))
      .status,
    404,
  );

  const recordedEvents = await (
    await request("/extractions/" + recorded.id + "/events")
  ).json();
  assert.equal(recordedEvents.events.length, 1);
  assert.equal(
    (await request("/extractions/" + recorded.id + "/events?since_sequence=-1"))
      .status,
    400,
  );
  assert.deepEqual(
    (await (await request("/extractions", "GET", undefined, 1)).json()).runs,
    [],
  );
  // Historical planning traces are read from storage without validating old provider output.
  const historicalId = randomUUID();
  const { transaction, appendEvent } = await import("./extraction/lifecycle");
  await transaction(async (c) => {
    await c.query(
      `INSERT INTO threadline_runs(id,user_id,source_revision_id,document_id,idempotency_key,
          pipeline_version,schema_version,provider,model,prompt_version,status,error_code,started_at,completed_at)
       VALUES($1::uuid,$2,$3,$4,$1::uuid::text,'plan-2',2,'mock','gemini-3.5-flash-lite','grounded-plan-3',
              'failed','EVIDENCE_MISMATCH',now(),now())`,
      [historicalId, users[0], initial.source.id, id],
    );
    await appendEvent(c, historicalId, "failed", { code: "EVIDENCE_MISMATCH" });
  });
  // A fresh HTTP server reads persisted data, not process-local document state.
  await new Promise<void>((resolve, reject) =>
    server!.close((e) => (e ? reject(e) : resolve())),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const restarted = server.address();
  assert.ok(restarted && typeof restarted !== "string");
  base = `http://127.0.0.1:${restarted.port}/api`;
  assert.deepEqual(
    await (await request("/extractions/" + recorded.id + "/events")).json(),
    recordedEvents,
  );
  const historicalPath = "/extractions/" + historicalId;
  const { run: historical } = (await (
    await request(historicalPath)
  ).json()) as unknown as {
    run: { prompt_version: string; error_code: string };
  };
  assert.equal(historical.prompt_version, "grounded-plan-3");
  assert.equal(historical.error_code, "EVIDENCE_MISMATCH");
  const historicalEvents = await (
    await request(historicalPath + "/events")
  ).json();
  assert.deepEqual(
    historicalEvents.events.map((e) => e.payload),
    [{ code: "EVIDENCE_MISMATCH" }],
  );
  const persisted = await (await request(`/documents/${id}`)).json();
  assert.equal(persisted.version, 6);
  assert.equal(persisted.source.revision, 2);
  assert.deepEqual(persisted.tags, ["planning", "team"]);
  assert.deepEqual((await (await request(blocks)).json()).blocks, [reopened]);
  const { processOne } = await import("./extraction/worker");
  const plan = "/plans/" + id;
  assert.equal((await request(plan, "GET", undefined, 1)).status, 404);
  assert.equal(
    (
      await request("/extractions", "POST", {
        ...extractionBody,
        schema_version: 2,
      })
    ).status,
    503,
  );
  const run = await extract(
    users[0],
    initial.source.id,
    randomUUID(),
    "mock",
    2,
  );
  assert.equal(
    (await (await request("/extractions/" + run.id + "/progress")).json())
      .status,
    "queued",
  );
  assert.equal(
    (await request("/extractions/" + run.id + "/progress", "GET", undefined, 1))
      .status,
    404,
  );
  const quote = "Decide later.";
  const start = [...body.source_text.slice(0, body.source_text.indexOf(quote))]
    .length;
  const proposal = {
    kind: "action",
    content: "Make a decision",
    uncertainty_reason: "Date is unknown",
    proposal: {
      description: null,
      category: "Planning",
      deadline_phrase: "later",
      suggested_priority: null,
    },
    evidence: [quote],
  };
  await processOne(
    {
      mode: "mock",
      generate: async () =>
        JSON.stringify({ schema_version: 2, blocks: [proposal] }),
    },
    run.id,
  );
  const {
    actions: [action],
  } = (await (await request(plan)).json()) as unknown as {
    actions: {
      id: string;
      schedule: string;
      due_date: string | null;
      evidence: { quote: string; start: number; end: number }[];
      task: unknown;
    }[];
  };
  assert.equal(action.schedule, "unresolved");
  assert.equal(action.due_date, null);
  assert.equal(action.evidence[0].quote, quote);
  assert.equal(action.evidence[0].start, start);
  assert.equal(action.evidence[0].end, start + quote.length);
  assert.equal(action.task, null);
  const actionPath = plan + "/" + action.id;
  const convert = actionPath + "/convert";
  const project = randomUUID(),
    foreignProject = randomUUID();
  await pool.query(
    "INSERT INTO focus_projects(id,user_id,name) VALUES ($1,$2,'Planning'),($3,$4,'Foreign')",
    [project, users[0], foreignProject, users[1]],
  );
  const approval = {
    version: 1,
    title: "Decide on meeting follow-up",
    description: "Review the notes first.",
    category: "Planning",
    project_id: project,
    priority: "medium",
    schedule: "scheduled",
    due_date: "2028-02-29",
    state: "confirmed",
  };
  assert.equal((await request(actionPath, "PATCH", approval, 1)).status, 404);
  assert.equal(
    (
      await request(actionPath, "PATCH", {
        ...approval,
        project_id: foreignProject,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(actionPath, "PATCH", {
        ...approval,
        due_date: "2027-02-29",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(actionPath, "PATCH", {
        ...approval,
        schedule: "unresolved",
        due_date: null,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(blocks + "/" + action.id, "PATCH", {
        version: 1,
        review_state: "confirmed",
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(convert, "POST", { version: 1, confirm: true })).status,
    409,
  );
  const edits = await Promise.all(
    [approval, { ...approval, description: "Read the source." }].map(
      (payload) => request(actionPath, "PATCH", payload),
    ),
  );
  assert.deepEqual(edits.map((response) => response.status).sort(), [204, 409]);
  assert.equal(
    (await request(convert, "POST", { version: 1, confirm: true })).status,
    409,
  );
  assert.equal(
    (await request(convert, "POST", { version: 2, confirm: false })).status,
    400,
  );
  assert.equal(
    (await request(convert, "POST", { version: 2, confirm: true }, 1)).status,
    404,
  );

  await pool.query(`CREATE FUNCTION reject_plan_link() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Injected fixture failure'; END $$;
    CREATE TRIGGER reject_plan_link BEFORE INSERT ON threadline_action_task_links FOR EACH ROW EXECUTE FUNCTION reject_plan_link()`);
  assert.equal(
    (await request(convert, "POST", { version: 2, confirm: true })).status,
    500,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM focus_tasks")).rows[0].n,
    0,
  );
  await pool.query(
    "DROP TRIGGER reject_plan_link ON threadline_action_task_links",
  );
  const queuedBeforeArchive = await extract(
    users[0],
    initial.source.id,
    randomUUID(),
    "mock",
    2,
  );
  const archive = { version: 6, archived: true };
  assert.equal((await request(path, "PATCH", archive)).status, 200);
  assert.equal(
    (await request(plan, "POST", { id: randomUUID(), title: "Blocked draft" }))
      .status,
    409,
  );
  assert.equal(
    (await request(convert, "POST", { version: 2, confirm: true })).status,
    409,
  );
  let dispatched = false;
  await processOne(
    {
      mode: "mock",
      generate: async () => {
        dispatched = true;
        return "{}";
      },
    },
    queuedBeforeArchive.id,
  );
  assert.equal(dispatched, false);
  assert.equal(
    (
      await pool.query("SELECT error_code FROM threadline_runs WHERE id=$1", [
        queuedBeforeArchive.id,
      ])
    ).rows[0].error_code,
    "DOCUMENT_ARCHIVED",
  );
  await assert.rejects(
    extract(users[0], initial.source.id, randomUUID(), "mock", 2),
    { code: "DOCUMENT_ARCHIVED" },
  );
  assert.equal(
    (await request(path, "PATCH", { version: 7, archived: false })).status,
    200,
  );
  const converted = await Promise.all(
    [1, 2].map(() => request(convert, "POST", { version: 2, confirm: true })),
  );
  assert.deepEqual(
    converted.map((response) => response.status).sort(),
    [200, 201],
  );
  const receipts = await Promise.all(
    converted.map(
      async (response) =>
        (await response.json()) as unknown as { task_id: string },
    ),
  );
  assert.equal(receipts[0].task_id, receipts[1].task_id);
  const taskId = receipts[0].task_id;
  assert.equal(
    (
      await pool.query(
        "SELECT title,to_char(due_date,'YYYY-MM-DD') AS date FROM focus_tasks WHERE id=$1",
        [taskId],
      )
    ).rows[0].date,
    approval.due_date,
  );
  assert.equal(
    (
      await request(
        "/tasks/" + taskId,
        "PATCH",
        { status: "done", title: "Foreign", priority: "low", version: 1 },
        1,
      )
    ).status,
    409,
  );
  assert.deepEqual(
    await (await request("/tasks", "GET", undefined, 1)).json(),
    [],
  );
  assert.equal((await request("/tasks/" + taskId, "DELETE")).status, 204);
  assert.deepEqual(
    await (
      await request(convert, "POST", { version: 2, confirm: true })
    ).json(),
    { task_id: null, created: false },
  );

  const manual = { id: randomUUID(), title: "A manual next step" };
  assert.equal((await request(plan, "POST", manual)).status, 201);
  assert.equal((await request(plan, "POST", manual)).status, 200);
  assert.equal(
    (await request(plan, "POST", { id: randomUUID(), title: "Foreign" }, 1))
      .status,
    404,
  );
  const manualPath = plan + "/" + manual.id;
  assert.equal(
    (
      await request(manualPath, "PATCH", {
        ...approval,
        title: manual.title,
        schedule: "unscheduled",
        due_date: null,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request(manualPath + "/convert", "POST", {
        version: 2,
        confirm: true,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM focus_tasks WHERE due_date IS NULL",
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS: grounded v2 and manual plans, explicit review, date validation, isolation, archive guards, concurrent retries, rollback and deletion receipts",
  );
  console.log(
    "PASS: document persistence/restart, idempotent capture, owner isolation, input validation, concurrent edit conflicts, archive/restore, exact immutable source history, security headers/origin",
  );
} finally {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
