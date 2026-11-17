// Only called inside capture-browser's disposable schema/server. No live adapter.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
export async function replayChecks({
  pool,
  send,
  evaluate,
  until,
  click,
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
      [source, user, document, "🧵 Note"],
    );
    return { user, source, token };
  }
  const a = await owner(),
    b = await owner();
  const raw = JSON.stringify({
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
    await evaluate("document.querySelectorAll('.execution-history>a').length"),
    2,
  );
  await click("Load older runs");
  await until("document.querySelectorAll('.execution-history>a').length===3");
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
  console.log(
    "PASS: persisted mock success/retry/interruption/recovery/cancel replay; forced small-page reads, reload IDs/timings, controls/pause/seek/rate/keyboard/touch, reduced motion, API failure, owner isolation; replay created zero runs",
  );
}
