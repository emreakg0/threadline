// Only called inside capture-browser's disposable schema/server. No live adapter.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
export async function replayChecks({
  pool,
  send,
  evaluate,
  until,
  click,
  input,
  screenshot,
  origin,
  enablePages,
}) {
  const { extract } =
    await import("../../../artifacts/api-server/src/extraction/service.ts");
  const { processOne, claim } =
    await import("../../../artifacts/api-server/src/extraction/worker.ts");
  const { recoverExpired, cancel } =
    await import("../../../artifacts/api-server/src/extraction/lifecycle.ts");
  const { ExtractionError } =
    await import("../../../artifacts/api-server/src/extraction/validation.ts");
  const excerpt =
    "🧵 Keep the original interview notes beside the synthesis so reviewers can check the wording.";
  async function owner() {
    const user = "replay-" + randomUUID(),
      document = randomUUID(),
      source = randomUUID(),
      token = randomBytes(32).toString("hex");
    await pool.query("INSERT INTO focus_users VALUES($1,$2,$3)", [
      user,
      "Replay QA",
      "qa@example.invalid",
    ]);
    await pool.query(
      "INSERT INTO focus_sessions VALUES($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(token).digest("hex"), user],
    );
    await pool.query(
      "INSERT INTO threadline_documents(id,user_id,title) VALUES($1,$2,$3)",
      [document, user, "Non-sensitive mock trace"],
    );
    await pool.query(
      "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,1,$4)",
      [source, user, document, excerpt],
    );
    return { user, document, source, token };
  }
  const a = await owner(),
    b = await owner();
  const raw = JSON.stringify({
    schema_version: 1,
    blocks: [
      {
        kind: "note",
        content: excerpt,
        uncertainty_reason:
          "The interview notes do not specify who will maintain the synthesis.",
        evidence: [{ quote: excerpt, start: 0, end: [...excerpt].length }],
      },
    ],
  });
  const mock = { mode: "mock", generate: async () => raw };
  const success = await extract(a.user, a.source, randomUUID(), "mock");
  await processOne(mock, success.id);
  const retry = await extract(a.user, a.source, randomUUID(), "mock");
  let attempts = 0;
  const retryAdapter = {
    mode: "mock",
    generate: async () => {
      if (++attempts === 1) throw new ExtractionError("PROVIDER_TRANSIENT");
      return raw;
    },
  };
  await processOne(retryAdapter, retry.id);
  await new Promise((r) => setTimeout(r, 1100));
  await processOne(retryAdapter, retry.id);
  assert.equal(attempts, 2);
  const interrupted = await extract(a.user, a.source, randomUUID(), "mock");
  await claim("mock", interrupted.id);
  await pool.query(
    "UPDATE threadline_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [interrupted.id],
  );
  await recoverExpired();
  const cancelled = await extract(b.user, b.source, randomUUID(), "mock");
  await cancel(b.user, cancelled.id);
  const count = (
    await pool.query("SELECT count(*)::int n FROM threadline_runs")
  ).rows[0].n;
  const taskCount = (
    await pool.query("SELECT count(*)::int n FROM focus_tasks")
  ).rows[0].n;
  enablePages();
  async function login(token) {
    await send("Network.setCookie", {
      name: "focus_session",
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
  }
  async function navigate(id) {
    await send("Page.navigate", { url: origin + "/#capture/run/" + id });
    await until(
      `document.querySelector('.execution-run-link')?.textContent.includes(${JSON.stringify(id)}) && document.querySelector('.execution-event')`,
    );
  }
  async function snapshot(id) {
    return evaluate(
      `import('/src/trace.ts').then(m=>m.loadTrace(${JSON.stringify(id)})).then(t=>JSON.stringify(t))`,
    );
  }

  await login(a.token);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await navigate(retry.id);
  const persisted = (
    await pool.query(
      "SELECT id,sequence,observed_at,event_type FROM threadline_execution_events WHERE run_id=$1 ORDER BY sequence",
      [retry.id],
    )
  ).rows;
  assert.equal(
    await evaluate("document.querySelectorAll('.execution-event').length"),
    persisted.length,
  );
  assert.deepEqual(
    await evaluate(
      "Array.from(document.querySelectorAll('.execution-event')).map(e=>e.dataset.eventId)",
    ),
    persisted.map((e) => e.id),
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.execution-run-list>a').length"),
    2,
  );
  await click("Load older runs");
  await until("document.querySelectorAll('.execution-run-list>a').length===3");
  const before = await snapshot(retry.id);
  await screenshot("replay-desktop");
  await click("Restart");
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"Seek recorded execution\"]').value",
    ),
    "0",
  );
  await click("Play");
  await until(
    "Number(document.querySelector('[aria-label=\"Seek recorded execution\"]').value)>100",
  );
  await click("Pause");
  const paused = await evaluate(
    "document.querySelector('[aria-label=\"Seek recorded execution\"]').value",
  );
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"Seek recorded execution\"]').value",
    ),
    paused,
  );
  await evaluate(
    "(()=>{const s=document.querySelector('.execution-controls select');s.value='2';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.execution-controls select').value",
    ),
    "2",
  );
  await click("Step →");
  const seq = await evaluate(
    "document.querySelector('.execution-event[aria-current=step]').dataset.sequence",
  );
  await evaluate("document.querySelector('.execution-replay').focus()");
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  assert.ok(
    Number(
      await evaluate(
        "document.querySelector('.execution-event[aria-current=step]').dataset.sequence",
      ),
    ) > Number(seq),
  );
  const forwardSequence = Number(
    await evaluate(
      "document.querySelector('.execution-event[aria-current=step]').dataset.sequence",
    ),
  );
  await click("← Step");
  assert.ok(
    Number(
      await evaluate(
        "document.querySelector('.execution-event[aria-current=step]').dataset.sequence",
      ),
    ) < forwardSequence,
  );
  await evaluate(
    "(()=>{const e=document.querySelector('[aria-label=\"Seek recorded execution\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,Number(e.max)/2);e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await until(
    "Number(document.querySelector('[aria-label=\"Seek recorded execution\"]').value)>1000",
  );
  const oldTimeOrigin = await evaluate("performance.timeOrigin");
  await send("Page.reload");
  await until(
    `performance.timeOrigin!==${oldTimeOrigin} && document.querySelectorAll('.execution-event').length===${persisted.length}`,
  );
  assert.equal(await snapshot(retry.id), before);
  assert.deepEqual(
    await evaluate(
      "Array.from(document.querySelectorAll('.execution-event')).map(e=>e.dataset.eventId)",
    ),
    persisted.map((e) => e.id),
  );
  await evaluate(
    "window.replayFetch=window.fetch;window.fetch=(...args)=>String(args[0]).includes('/events?')?Promise.reject(new Error('fixture failure')):window.replayFetch(...args)",
  );
  await click("Refresh records");
  await until("document.body.innerText.includes('No partial playback')");
  assert.equal(
    await evaluate("document.querySelectorAll('.execution-event').length"),
    0,
  );
  await evaluate("window.fetch=window.replayFetch");
  await click("Refresh records");
  await until("document.querySelector('.execution-event')");
  await navigate(interrupted.id);
  assert.ok(
    await evaluate(
      "document.querySelector('.execution-summary').textContent.includes('interrupted')",
    ),
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.execution-log').textContent.includes('recovered')",
    ),
  );
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('.execution-node')).find(n=>n.textContent.includes('Extract structure')).dataset.state",
    ),
    "interrupted",
  );
  for (const suffix of ["", "/events", "/steps"])
    assert.equal(
      await evaluate(
        `fetch('/api/extractions/'+${JSON.stringify(cancelled.id + suffix)}).then(r=>r.status)`,
      ),
      404,
    );
  await login(b.token);
  await navigate(cancelled.id);
  assert.ok(
    await evaluate(
      "document.querySelector('.execution-summary').textContent.includes('cancelled')",
    ),
  );
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('.execution-node')).find(n=>n.textContent.includes('Extract structure')).dataset.state",
    ),
    "not observed",
  );
  await login(a.token);
  await navigate(success.id);
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.execution-node[data-state=succeeded]').length",
    ),
    4,
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await until("document.documentElement.scrollWidth<=innerWidth");
  await until(
    "Array.from(document.querySelectorAll('.execution-controls button')).find(b=>b.textContent==='Play').disabled",
  );
  await screenshot("replay-mobile");
  await click("Restart");
  await evaluate(
    "document.querySelector('[aria-label=\"Next recorded event\"]').scrollIntoView({block:'center'})",
  );
  const rect = await evaluate(
    "(()=>{const r=document.querySelector('[aria-label=\"Next recorded event\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()",
  );
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...rect, id: 1 }],
  });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await until(
    "document.querySelector('.execution-event[aria-current=step]').dataset.sequence==='2'",
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM threadline_runs")).rows[0].n,
    count,
  );
  await evaluate(`location.hash='#capture/review/${a.document}'`);
  await until("document.querySelectorAll('article.tl-block').length===2");
  await evaluate("document.querySelector('.tl-block details').open=true");
  assert.equal(
    await evaluate(
      "document.querySelector('.tl-block blockquote').textContent",
    ),
    excerpt,
  );
  await screenshot("review-mobile");
  await input("[aria-label='Filter by block kind']", "decision");
  await until("document.body.innerText.includes('No matching blocks')");
  await input("[aria-label='Filter by block kind']", "note");
  await until("document.querySelectorAll('article.tl-block').length===2");
  const secondBlock = await evaluate(
    "document.querySelectorAll('article.tl-block')[1].id",
  );
  await input(
    "[aria-label='Jump to block']",
    secondBlock.replace("tl-block-", ""),
  );
  assert.equal(await evaluate("document.activeElement.id"), secondBlock);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 820,
    height: 1040,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until("document.documentElement.scrollWidth<=innerWidth");
  await evaluate("document.querySelector('.tl-block details').open=true");
  await screenshot("review-tablet");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Emulation.setEmulatedMedia", { features: [] });
  await evaluate("document.querySelector('.tl-block details').open=true");
  await screenshot("review-desktop");
  const blockId = await evaluate(
    `fetch('/api/documents/${a.document}/blocks').then(res=>res.json()).then(data=>data.blocks[0].id)`,
  );
  await click("Edit block");
  await input(
    "[data-testid=block-draft]",
    "Personal interpretation of the source note.",
  );
  await click("← Review documents");
  await click("Non-sensitive mock trace");
  await until(
    "document.querySelector('[data-testid=block-draft]')?.getClientRects().length",
  );
  assert.equal(
    await evaluate("document.querySelector('[data-testid=block-draft]').value"),
    "Personal interpretation of the source note.",
  );
  assert.equal(
    await evaluate(`fetch('/api/documents/${a.document}/blocks/${blockId}', {
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({version:1,review_state:'dismissed'}),
  }).then(res=>res.status)`),
    200,
  );
  await click("Save block");
  await until(
    "document.body.innerText.includes('This block changed elsewhere')",
  );
  assert.match(
    await evaluate(
      "document.querySelector('.tl-block-edit [role=alert]').innerText",
    ),
    /changed elsewhere/,
  );
  assert.equal(
    await evaluate("document.querySelector('[data-testid=block-draft]').value"),
    "Personal interpretation of the source note.",
  );
  await click("Reload blocks");
  await click("Keep my draft against this version");
  await click("Save block");
  await until(
    "document.querySelector('.tl-block-content').textContent.includes('Personal interpretation')",
  );
  await click("Confirm");
  await until("document.body.innerText.includes('Confirmed by you')");
  const reviewPage = await evaluate("performance.timeOrigin");
  await send("Page.reload");
  await until(
    `performance.timeOrigin!==${reviewPage} && document.querySelector('.tl-block-content')?.textContent.includes('Personal interpretation')`,
  );
  assert.ok(
    await evaluate(
      "document.querySelector('article.tl-block').innerText.includes('Confirmed by you') && document.querySelector('article.tl-block').innerText.includes('Edited by you')",
    ),
  );
  await evaluate("document.querySelector('.tl-block details').open=true");
  assert.equal(
    await evaluate(
      "document.querySelector('.tl-block blockquote').textContent",
    ),
    excerpt,
  );
  await screenshot("review-confirmed-desktop");
  await evaluate(
    "Array.from(document.querySelectorAll('article.tl-block button')).find(b=>b.textContent==='Dismiss').click()",
  );
  await until(
    "document.querySelector('article.tl-block [data-review=dismissed]')",
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM focus_tasks")).rows[0].n,
    taskCount,
  );
  // Faults are injected only through the disposable test schema and mock adapter.
  const { calcPlan, calcSource } = await import("../../../artifacts/api-server/src/action-thread/fixtures.ts");
  await pool.query(
    "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,2,$4)",
    [randomUUID(), a.user, a.document, calcSource],
  );
  const calcRevision = (await pool.query(
    "SELECT id FROM threadline_source_revisions WHERE document_id=$1 AND revision=2", [a.document],
  )).rows[0].id;
  const queued = (source = a.source, version = 1) => extract(a.user, source, randomUUID(), "mock", version);
  const providerFailure = await queued();
  let providerCalls = 0;
  const unavailable = { mode: "mock", generate: async () => {
    providerCalls++;
    throw new ExtractionError("PROVIDER_TRANSIENT");
  }};
  await processOne(unavailable, providerFailure.id);
  // Advance the synthetic queue clock without changing production retry behavior.
  await pool.query("UPDATE threadline_runs SET lease_expires_at=now() WHERE id=$1", [providerFailure.id]);
  await processOne(unavailable, providerFailure.id);
  assert.equal(providerCalls, 2);
  const invalid = await queued(calcRevision, 3);
  await processOne({ mode: "mock", generate: async () => "{invalid" }, invalid.id);
  // Per-revision v3 deduplication requires a separate revision for the rollback fixture.
  const rollbackRevision = randomUUID();
  await pool.query(
    "INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,3,$4)",
    [rollbackRevision, a.user, a.document, calcSource],
  );
  const rollback = await queued(rollbackRevision, 3);
  await pool.query(`CREATE FUNCTION fixture_reject_thread_edges() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$;
    CREATE TRIGGER fixture_reject_thread_edges BEFORE INSERT ON threadline_action_thread_edges
    FOR EACH ROW EXECUTE FUNCTION fixture_reject_thread_edges()`);
  try {
    await processOne({ mode: "mock", generate: async () => JSON.stringify(calcPlan()) }, rollback.id);
  } finally {
    await pool.query("DROP TRIGGER fixture_reject_thread_edges ON threadline_action_thread_edges");
  }
  const rejected = await queued(a.source, 2);
  await pool.query("UPDATE threadline_documents SET archived_at=now() WHERE id=$1", [a.document]);
  const beforeRejection = providerCalls;
  await processOne(unavailable, rejected.id);
  assert.equal(providerCalls, beforeRejection);
  await pool.query("UPDATE threadline_documents SET archived_at=NULL WHERE id=$1", [a.document]);

  for (const [run, revision, original, label, state, reason] of [
    [providerFailure, 1, excerpt, "Extract structure", "failed", "temporarily unavailable"],
    [interrupted, 1, excerpt, "Extract structure", "interrupted", "lease expired"],
    [invalid, 2, calcSource, "Verify evidence", "failed", "valid JSON"],
    [rollback, 3, calcSource, "Save for review", "failed", "rolled back the output transaction"],
    [rejected, 1, excerpt, "Validate source", "failed", "brain dump was archived"],
  ]) {
    await navigate(run.id);
    await until("document.querySelector('.execution-recovery')");
    const branch = await evaluate("document.querySelector('.execution-recovery').textContent");
    assert.ok(branch.includes(reason), branch);
    assert.ok(branch.includes("Input preserved"));
    assert.ok(branch.includes("Available now"));
    assert.equal(await evaluate(`[...document.querySelectorAll('.execution-node')].find(n=>n.textContent.includes(${JSON.stringify(label)})).dataset.state`), state);
    const saved = await evaluate(`fetch('/api/documents/${a.document}/revisions/${revision}').then(r=>r.json()).then(v=>v.source_text)`);
    assert.equal(saved, original);
    assert.ok(!(await snapshot(run.id)).includes(original));
    const output = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM threadline_knowledge_blocks WHERE originating_run_id=$1)
        OR EXISTS(SELECT 1 FROM threadline_action_threads WHERE id=$1) AS saved`, [run.id],
    );
    assert.equal(output.rows[0].saved, false);
  }

  await navigate(rollback.id);
  await screenshot("replay-recovery-rollback");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await until("innerWidth===390 && document.documentElement.scrollWidth<=innerWidth");
  await screenshot("replay-recovery-mobile");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [] });
  await evaluate("[...document.querySelectorAll('.execution-event')].find(b=>b.textContent.includes('step_failed')).click()");
  assert.equal(await evaluate("document.querySelector('.execution-recovery').textContent.includes('rolled back')"), false);
  await evaluate("[...document.querySelectorAll('.execution-event')].find(b=>b.textContent.includes('recovered')).click()");
  assert.equal(await evaluate("document.querySelector('.execution-recovery').textContent.includes('rolled back')"), true);
  await click("Open manual plan");
  await until(`location.hash==='#capture/plan/${a.document}'`);
  await navigate(rollback.id);
  assert.equal(await evaluate("document.querySelector('.execution-recovery').textContent.includes('Alternative selected')"), true);
  await send("Page.reload");
  await until("document.querySelector('.execution-recovery')?.textContent.includes('Alternative selected')");
  const repeatChoice = `fetch('/api/extractions/${rollback.id}/recovery/manual',{method:'POST'}).then(r=>r.status)`;
  assert.equal(await evaluate(repeatChoice), 204);
  assert.equal(JSON.parse(await snapshot(rollback.id)).events.filter(e=>e.event_type==="alternative_selected").length, 1);
  await login(b.token);
  assert.equal(await evaluate(repeatChoice), 404);
  await login(a.token);
  await navigate(rejected.id);
  await evaluate("document.querySelector('.execution-recovery-options a').click()");
  await until("document.querySelector('#capture-source')?.value.length");
  const correction = "Corrected synthetic brain dump for the next revision.";
  await input("#capture-source", "  ");
  assert.equal(await evaluate("document.querySelector('.tl-save-controls button').disabled && document.querySelector('#capture-source').value==='  '"), true);
  await input("#capture-source", correction);
  await click("Save changes");
  await until("document.querySelector('.tl-doc-details')?.textContent.includes('Revision 4')");
  assert.equal(await evaluate(`fetch('/api/documents/${a.document}/revisions/1').then(r=>r.json()).then(v=>v.source_text)`), excerpt);
  assert.equal(await evaluate(`fetch('/api/documents/${a.document}/revisions/4').then(r=>r.json()).then(v=>v.source_text)`), correction);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM threadline_runs WHERE provider='gemini'")).rows[0].n, 0);
  console.log("PASS: Stage 4A source validation, transient provider failure, interruption, invalid JSON and graph rollback with exact source reads, cursor-gated recovery, manual choice and owner isolation");
  console.log(
    "PASS: persisted mock success/retry/interruption/recovery/cancel replay; forced small-page reads, reload IDs/timings, controls/pause/seek/rate/keyboard/touch, reduced motion, API failure, owner isolation; replay created zero runs",
  );
}
