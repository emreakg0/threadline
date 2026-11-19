import { planChecks } from "./plan-browser-check.mjs";
import { replayChecks } from "./replay-browser-check.mjs";
// Uses existing Chromium/CDP and real isolated PostgreSQL fixtures. No AI calls.
import pg from "../node_modules/pg/lib/index.js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, request as proxyRequest } from "node:http";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const schema = `capture_browser_${randomUUID().replaceAll("-", "")}`;
process.env.PGOPTIONS = `-c search_path=${schema}`;
const origin = "http://127.0.0.1:28126";
process.env.APP_ORIGIN = origin;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const uid = `capture-browser-${randomUUID()}`,
  token = randomBytes(32).toString("hex");
let server, ws, target;
let stopWorker;
let sliceReplayPages = false;
let sequence = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(Error(`CDP timeout: ${method}`));
    }, 20000);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timeout);
        resolve(r);
      },
      reject,
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function until(expression) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch (cause) {
      if (
        !/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(
          cause.message,
        )
      )
        throw cause;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(`Timed out: ${expression}`);
}
async function click(text) {
  const expr = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)}))`;
  await until(`(${expr}) && !(${expr}).disabled`);
  return evaluate(`(${expr}).click()`);
}
async function input(selector, value) {
  await evaluate(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
}
async function key(key, code = key, modifiers = 0) {
  const windowsVirtualKeyCode = { k: 75, ArrowDown: 40, Escape: 27, Enter: 13 }[
    key
  ];
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
  });
}
async function viewport(width, height, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await until(
    `innerWidth===${width} && document.documentElement.scrollWidth<=innerWidth`,
  );
}
async function screenshot(name) {
  await evaluate(
    "Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime<1000).map(a=>a.finished)).then(()=>true)",
  );
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: !name.startsWith("command-"),
  });
  await writeFile(
    `/tmp/${process.env.THREADLINE_SCREENSHOT_PREFIX || "threadline-5a"}-${name}.png`,
    Buffer.from(result.data, "base64"),
  );
}
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const migrated = spawnSync(
    process.execPath,
    [new URL("./migrate.mjs", import.meta.url).pathname],
    { env: process.env, encoding: "utf8", timeout: 60000 },
  );
  assert.equal(migrated.status, 0);
  await pool.query("INSERT INTO focus_users VALUES ($1,$2,$3)", [
    uid,
    "Alex Morgan",
    "qa@example.invalid",
  ]);
  await pool.query(
    "INSERT INTO focus_sessions VALUES ($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex"), uid],
  );
  const { default: app } =
    await import("../../../artifacts/api-server/src/app.ts");
  const { startWorker } =
    await import("../../../artifacts/api-server/src/extraction/worker.ts");
  stopWorker = startWorker();
  server = createServer((req, res) => {
    if (req.url.startsWith("/api")) {
      if (sliceReplayPages && req.method === "GET") {
        const json = (body) => app.response.json.call(res, body);
        res.json = (body) => {
          const url = new URL(req.url, origin);
          if (body.events?.length > 2)
            return json({
              ...body,
              events: body.events.slice(0, 2),
              next_sequence: Number(body.events[1].sequence),
              has_more: true,
            });
          if (body.steps?.length > 2)
            return json({
              ...body,
              steps: body.steps.slice(0, 2),
              next_offset: Number(url.searchParams.get("offset") ?? 0) + 2,
            });
          if (body.runs?.length > 2)
            return json({
              ...body,
              runs: body.runs.slice(0, 2),
              next_offset: Number(url.searchParams.get("offset") ?? 0) + 2,
            });
          return json(body);
        };
      }
      app(req, res);
      return;
    }
    const proxy = proxyRequest(
      `http://127.0.0.1:21646${req.url}`,
      { method: req.method, headers: req.headers },
      (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.writeHead(503);
      res.end("Frontend unavailable");
    });
    req.pipe(proxy);
  });
  await new Promise((resolve) => server.listen(28126, "127.0.0.1", resolve));
  target = await (
    await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) =>
    ws.addEventListener("open", resolve, { once: true }),
  );
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const p = pending.get(message.id);
      if (p) {
        pending.delete(message.id);
        message.error
          ? p.reject(Error(message.error.message))
          : p.resolve(message.result);
      }
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.text);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: origin + "/" });
  await until("document.querySelector('.tl-sign-in h1')");
  assert.equal(await evaluate("document.title"), "Threadline");
  await until(
    "!document.body.innerText.includes('Connecting to your workspace')",
  );
  assert.ok(
    await evaluate("!document.querySelector('.tl-sidebar, canvas, .shell')"),
  );
  if (
    await evaluate(
      "fetch('/api/auth/me').then(r => r.json()).then(a => a.configured)",
    )
  ) {
    assert.equal(
      await evaluate(
        "document.querySelector('.tl-sign-in a').getAttribute('href')",
      ),
      "/api/auth/google",
    );
  }
  await screenshot("sign-in");
  await send("Network.setCookie", {
    name: "focus_session",
    value: token,
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  await send("Page.navigate", { url: origin + "/" });
  await until(
    "document.querySelector('#capture-title') && !document.body.innerText.includes('Loading your library')",
  );
  await screenshot("empty-desktop");
  await evaluate("location.hash='#capture/review'");
  await until("document.body.innerText.includes('No extracted knowledge yet')");
  assert.match(
    await evaluate("document.querySelector('.tl-review-empty').innerText"),
    /after a saved document is processed/,
  );
  await screenshot("review-empty-desktop");
  await viewport(390, 844, true);
  await screenshot("review-empty-mobile");
  await viewport(1440, 1000);
  await evaluate("location.hash='#capture/library'");
  await until("document.body.innerText.includes('No saved documents yet')");
  await evaluate("location.hash='#capture'");
  await until(
    "document.querySelector('#capture-title').getClientRects().length",
  );
  await input("#capture-title", "Product direction · November");
  const original =
    "Meeting notes — November 16\n\nWe agreed to keep the first release focused on capture.\n\n• Preserve every original source.\n• Review the mobile experience together.\n• Open question: when should we add connections?";
  await input("#capture-source", original);
  await screenshot("desktop");
  // Simulate a lost response AFTER a real persisted write. Retry must not duplicate it.
  await evaluate(
    `window.originalFetch=window.fetch;window.fetch=async(...args)=>{const r=await window.originalFetch(...args);if(String(args[0])==='/api/documents' && args[1]?.method==='POST'){window.fetch=window.originalFetch;throw new TypeError('Simulated lost response');}return r;}`,
  );
  await click("Save brain dump");
  await until(
    "document.querySelector('.tl-error') && !document.querySelector('.tl-primary').disabled",
  );
  assert.equal(
    await evaluate("document.querySelector('#capture-source').value"),
    original,
  );
  await click("Save brain dump");
  await until("document.body.innerText.includes('Saved brain dump')");
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM threadline_documents"))
      .rows[0].n,
    1,
  );
  await send("Page.reload");
  await until("document.querySelector('#capture-title')?.value===''");
  await evaluate("location.hash='#capture/library'");
  await until("document.querySelector('.tl-document-row')");
  await click("Product direction");
  await until(
    "document.querySelector('#capture-title').value==='Product direction · November'",
  );
  await input("#capture-source", original + "\n\nNext: gather feedback.");
  await evaluate("document.querySelector('#capture-source').focus()");
  await key("Enter", "Enter", 2);
  await until("document.body.innerText.includes('Revision 2 ·')");
  await click("Source history");
  await until("document.querySelector('.tl-history pre')");
  assert.equal(
    await evaluate("document.querySelector('.tl-history pre').textContent"),
    original,
  );
  await click("Close history");
  assert.equal(
    await evaluate("document.activeElement.textContent.trim()"),
    "Source history",
  );
  await until(
    "document.querySelector('.tl-live-state')?.textContent.includes('Live Gemini is disabled')",
  );
  assert.ok(
    await evaluate(
      "Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Develop action plan').disabled",
    ),
  );
  // External owner-session update creates a real version conflict.
  await evaluate(
    `fetch('/api/documents').then(r=>r.json()).then(p=>fetch('/api/documents/'+p.documents[0].id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:p.documents[0].version,title:'Updated in another tab'})}))`,
  );
  await input("#capture-source", "My unsaved local draft");
  await click("Save changes");
  await until("document.querySelector('.tl-conflict')");
  assert.equal(
    await evaluate("document.querySelector('#capture-source').value"),
    "My unsaved local draft",
  );
  // Accept replacing the draft only via explicit browser confirmation.
  await send("Page.enable");
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.method === "Page.javascriptDialogOpening")
      void send("Page.handleJavaScriptDialog", { accept: true });
  });
  await click("Use saved version");
  await until(
    "document.querySelector('#capture-title').value==='Updated in another tab'",
  );
  await click("Archive document");
  await until("document.body.innerText.includes('Document archived')");
  await evaluate("location.hash='#capture/library'");
  await click("Archived");
  await click("Updated in another tab");
  await click("Restore document");
  await until("document.body.innerText.includes('Document restored')");
  await evaluate("location.hash='#capture/library'");
  await click("Active");
  await until("document.querySelector('.tl-document-row')");
  await evaluate("location.hash='#capture/collections'");
  await until("document.querySelector('.tl-collection-create input')");
  await input(".tl-collection-create input", "Product research");
  await click("Create collection");
  await until(
    "document.body.innerText.includes('Product research') && !document.querySelector('.tl-collection-create input').readOnly",
  );
  for (const name of ["Studio notes", "Reading desk"]) {
    await input(".tl-collection-create input", name);
    await click("Create collection");
    await until(
      "document.body.innerText.includes(" + JSON.stringify(name) + ")",
    );
  }
  await click("Product research");
  await until(
    "document.body.innerText.includes('No documents in this collection')",
  );
  await click("All collections");
  await click("Updated in another tab");
  await until("document.querySelector('.tl-document-organization')");
  await evaluate(
    "document.querySelector('.tl-document-organization').open=true",
  );
  const collectionId = await evaluate(
    "Array.from(document.querySelectorAll('.tl-document-organization option')).find(o=>o.textContent==='Product research').value",
  );
  await input(".tl-document-organization select", collectionId);
  await input("[aria-label='New tag']", "planning");
  await click("Add tag");
  await input("[aria-label='New tag']", "fieldwork");
  await click("Add tag");
  await click("Save changes");
  await until("document.body.innerText.includes('Saved brain dump')");

  await evaluate("document.querySelector('.tl-new').click()");
  await until(
    "document.querySelector('#capture-title')?.getClientRects().length && document.querySelector('#capture-title').value===''",
  );
  await input(
    "#capture-title",
    "Research synthesis for the winter release — accessibility, calendar handoffs, and open questions from the November design review",
  );
  await input(
    "#capture-source",
    [
      "Research synthesis · 19 November",
      "Decision\nThe north-star criterion is uninterrupted reading across viewport sizes. The note should keep its title, source text, and save state together as the workspace narrows.",
      "Reading and navigation\nParticipants could find their recent notes quickly. Longer titles became hard to distinguish on smaller screens, especially when a collection label was the only visible cue.",
      "Calendar handoff\nKeep dates in the source whenever the team hasn't agreed on a deadline. Capture the rationale alongside the decision so the next reader knows why it was made.",
      "Open question\nShould a saved note return to the original collection, or to the most recent document search? Test both with a keyboard and on a narrow screen.",
      "Next session\nBring the marked-up transcript and a short list of the places where people stopped to look for the next step.",
      ...Array.from(
        { length: 20 },
        (_, i) =>
          `Field observation ${i + 1}\nParticipants moved between a source note and their review queue. Record the point where they chose to inspect the original evidence.`,
      ),
    ].join("\n\n"),
  );
  await click("Save brain dump");
  await until("document.body.innerText.includes('Saved brain dump')");
  await evaluate("document.querySelector('#capture-title').blur()");
  await screenshot("capture-long-desktop");
  await viewport(820, 1040);
  await screenshot("capture-tablet");
  await viewport(390, 844, true);
  assert.ok(
    await evaluate(
      "document.querySelector('#capture-title').scrollHeight<=document.querySelector('#capture-title').clientHeight+1",
    ),
  );
  await screenshot("capture-mobile");
  await viewport(1440, 1000);
  await input("#capture-source", "Unsaved edits to the second document");
  await evaluate("location.hash='#capture/collections'");
  await until("document.querySelectorAll('.tl-document-row').length===2");
  await click("Product research");
  await until(
    "document.querySelectorAll('.tl-document-row').length===1 && document.querySelector('.tl-document-row').textContent.includes('fieldwork')",
  );
  await screenshot("collections-desktop");
  await viewport(820, 1040);
  await screenshot("collections-tablet");
  await viewport(390, 844, true);
  await screenshot("collections-mobile");
  await viewport(1440, 1000);
  await click("Updated in another tab");
  await until(
    "document.querySelector('#capture-title').value==='Updated in another tab'",
  );
  await evaluate(
    "document.querySelector('.tl-doc-context a[href=\"#capture/collections\"]').click()",
  );
  await until(
    "document.querySelector('.tl-collection-heading').getClientRects().length && document.querySelector('.tl-collection-heading h2').textContent==='Product research'",
  );
  await evaluate("location.hash='#capture/library'");
  await until("document.querySelectorAll('.tl-document-row').length===2");
  await screenshot("library-desktop");
  await viewport(820, 1040);
  await screenshot("library-tablet");
  await viewport(1440, 1000);
  await input(".tl-filters input", "gather feedback");
  await until(
    "document.querySelectorAll('.tl-document-row').length===1 && document.querySelector('.tl-document-row').textContent.includes('Updated in another tab')",
  );
  await input("[aria-label='Filter by tag']", "planning");
  await until(
    "document.querySelector('.tl-document-row small')?.textContent.includes('#planning')",
  );
  await input(".tl-filters input", "absolutely unmatched search");
  await until("document.body.innerText.includes('No matching documents')");
  await input(".tl-filters input", "");
  await click("Updated in another tab");
  await until(
    "document.querySelector('#capture-title')?.value==='Updated in another tab'",
  );

  await evaluate("document.querySelector('#capture-source').focus()");
  await key("k", "KeyK", 2);
  await until(
    "document.querySelector('.tl-command').open && document.activeElement.getAttribute('role')==='combobox'",
  );
  await key("ArrowDown");
  await until(
    "document.querySelector('#tl-command-1').getAttribute('aria-selected')==='true'",
  );
  await until(
    "document.querySelectorAll('.tl-command [role=group]').length===3",
  );
  await screenshot("command-desktop");
  await viewport(390, 844, true);
  await screenshot("command-mobile");
  await viewport(1440, 1000);
  await key("Escape");
  await until(
    "!document.querySelector('.tl-command').open && document.activeElement.id==='capture-source'",
  );
  await key("k", "KeyK", 2);
  await until("document.querySelector('.tl-command').open");
  await input(".tl-command input", "uninterrupted reading");
  await until(
    "document.querySelector('[role=option]')?.textContent.includes('Research synthesis')",
  );
  await input(".tl-command input", "uninterrupted reading ");
  await until(
    "document.querySelector('.tl-command [role=option]')?.textContent.includes('Research synthesis') && !document.querySelector('.tl-command-status')",
  );
  await screenshot("command-search-desktop");
  await key("Enter");
  await until(
    "!document.querySelector('.tl-command').open && document.querySelector('#capture-source').value==='Unsaved edits to the second document'",
  );
  await click("Save changes");
  await until("document.body.innerText.includes('Saved brain dump')");
  const previousPage = await evaluate("performance.timeOrigin");
  await send("Page.reload");
  await until(
    `performance.timeOrigin!==${previousPage} && document.querySelector('#capture-source')?.value==='Unsaved edits to the second document'`,
  );
  await evaluate("location.hash='#capture/library'");
  await until("document.querySelectorAll('.tl-document-row').length===2");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await until("document.documentElement.scrollWidth<=window.innerWidth");
  await screenshot("mobile");
  assert.ok(
    await evaluate(
      "Array.from(document.querySelectorAll('.tl-sidebar nav a')).every(a=>a.getBoundingClientRect().height>=44)",
    ),
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.tl-primary')).transitionDuration",
    ),
    "0s",
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await until(
    "innerWidth===320 && document.documentElement.scrollWidth<=innerWidth",
  );
  await screenshot("navigation-320");
  const captureNav = await evaluate(
    "(()=>{const r=document.querySelector('.tl-sidebar nav a').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()",
  );
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [captureNav],
  });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await until("location.hash==='#capture'");
  await evaluate("document.querySelector('.tl-new').click()");
  await until("document.querySelector('#capture-title').value===''");
  await input("#capture-source", "Unsaved draft survives execution inspection");
  await evaluate(
    "document.querySelector('nav a[href=\"#capture/tasks\"]').click()",
  );
  await until(
    "document.querySelector('.tl-tasks h1')?.textContent === 'Tasks'",
  );
  await input('input[name="name"]', "Standalone browser project");
  await click("Create project");
  await until(
    "Array.from(document.querySelectorAll('.tl-tasks option')).some(option => option.textContent === 'Standalone browser project')",
  );
  await click("+ New task");
  await until("document.querySelector('.task-sheet[open]')");
  await input('.task-sheet [name="title"]', "Standalone browser task");
  await input(
    '.task-sheet [name="project_id"]',
    await evaluate(
      "Array.from(document.querySelectorAll('.task-sheet option')).find(option => option.textContent === 'Standalone browser project').value",
    ),
  );
  await click("Create task");
  await until("!document.querySelector('.task-sheet[open]')");
  await click("Standalone browser task");
  await until("document.querySelector('.task-sheet[open]')");
  await input('.task-sheet [name="title"]', "Updated standalone browser task");
  await click("Save changes");
  await until("!document.querySelector('.task-sheet[open]')");
  await evaluate(
    "document.querySelector('.task [aria-label=\"Complete task\"]').click()",
  );
  await until("document.querySelector('.task [aria-label=\"Reopen task\"]')");
  assert.ok(
    await evaluate(
      "document.documentElement.scrollWidth <= innerWidth && !document.querySelector('canvas, .view-switch')",
    ),
  );
  await until("!document.querySelector('.save-notice').textContent.trim()");
  await screenshot("tasks-mobile");
  await evaluate("document.querySelector('nav a[href=\"#capture\"]').click()");
  await until(
    "document.querySelector('#capture-source').getClientRects().length && document.querySelector('#capture-source').value==='Unsaved draft survives execution inspection'",
  );
  await evaluate(
    "document.querySelector('.tl-sidebar a[href=\"#capture/runs\"]').click()",
  );
  await until("document.querySelector('.execution-workspace')");
  await evaluate("document.querySelector('.execution-workspace>a').click()");
  await until("!document.querySelector('.execution-workspace')");
  assert.equal(
    await evaluate("document.querySelector('#capture-source').value"),
    "Unsaved draft survives execution inspection",
  );
  await replayChecks({
    pool,
    send,
    evaluate,
    until,
    click,
    input,
    screenshot,
    origin,
    enablePages: () => {
      sliceReplayPages = true;
    },
  });
  await planChecks({
    pool,
    uid,
    token,
    origin,
    send,
    evaluate,
    until,
    click,
    input,
    screenshot,
    viewport,
    key,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile capture, stable retry, persisted revisions, conflict preservation, archive/restore, reduced motion and standalone Tasks create, edit, complete and draft-preserving navigation",
  );
} finally {
  await stopWorker?.();
  if (ws) ws.close();
  if (target)
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`).catch(
      () => {},
    );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
