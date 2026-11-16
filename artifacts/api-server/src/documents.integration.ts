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
  source_text: string;
  id: string;
  version: number;
  source: { source_text: string; revision: number };
  archived_at: string | null;
  documents: { id: string }[];
  revisions: unknown[];
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
    { version: 1, collection_id: randomUUID() },
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
  // A fresh HTTP server reads persisted data, not process-local document state.
  await new Promise<void>((resolve, reject) =>
    server!.close((e) => (e ? reject(e) : resolve())),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const restarted = server.address();
  assert.ok(restarted && typeof restarted !== "string");
  base = `http://127.0.0.1:${restarted.port}/api`;
  const persisted = await (await request(`/documents/${id}`)).json();
  assert.equal(persisted.version, 5);
  assert.equal(persisted.source.revision, 2);
  console.log(
    "PASS: document persistence/restart, idempotent capture, owner isolation, input validation, concurrent edit conflicts, archive/restore, exact immutable source history, security headers/origin",
  );
} finally {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
