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
    if (await evaluate(`Boolean(${expression})`)) return;
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
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    `/tmp/threadline-2a-${name}.png`,
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
  server = createServer((req, res) => {
    if (req.url.startsWith("/api")) {
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
  await send("Network.setCookie", {
    name: "focus_session",
    value: token,
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  await send("Page.navigate", { url: origin + "/#capture" });
  await until(
    "document.querySelector('#capture-title') && !document.body.innerText.includes('Loading your library')",
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
  await click("Save capture");
  await until(
    "document.querySelector('.tl-error') && !document.querySelector('.tl-primary').disabled",
  );
  assert.equal(
    await evaluate("document.querySelector('#capture-source').value"),
    original,
  );
  await click("Save capture");
  await until("document.body.innerText.includes('Saved to your library')");
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM threadline_documents"))
      .rows[0].n,
    1,
  );
  await send("Page.reload");
  await until(
    "document.querySelector('.tl-document-row') && document.querySelector('#capture-title').value===''",
  );
  await click("Product direction");
  await until(
    "document.querySelector('#capture-title').value==='Product direction · November'",
  );
  await input("#capture-source", original + "\n\nNext: gather feedback.");
  await click("Save changes");
  await until("document.body.innerText.includes('Revision 2 ·')");
  await click("Source history");
  await until("document.querySelector('.tl-history pre')");
  assert.equal(
    await evaluate("document.querySelector('.tl-history pre').textContent"),
    original,
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
  await click("Archived");
  await until("document.querySelector('.tl-document-row')");
  await click("Restore document");
  await until("document.body.innerText.includes('Document restored')");
  await click("Active");
  await until("document.querySelector('.tl-document-row')");
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
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.tl-primary')).transitionDuration",
    ),
    "0s",
  );
  await click("▦ Focus City");
  await until("document.querySelector('.shell')");
  await click("⌁ Threadline Capture");
  await until("document.querySelector('#capture-title')");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile capture, uncertain-save retry without duplicates, reload persistence, revisions/originals, real conflict preserving draft, archive/restore, reduced motion, Focus City round trip; screenshots /tmp/threadline-2a-{desktop,mobile}.png",
  );
} finally {
  if (ws) ws.close();
  if (target)
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`).catch(
      () => {},
    );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
