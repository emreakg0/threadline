import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { action, calcPlan, calcSource, plan, portfolioPlan, portfolioSource } from "../../../artifacts/api-server/src/action-thread/fixtures.ts";

// The caller provides its disposable schema and authenticated Chromium session.
export async function threadChecks({ pool, uid, token, origin, send, evaluate, until, click, input, screenshot, viewport, key, simulateAdmission }) {
  const { extract } = await import("../../../artifacts/api-server/src/extraction/service.ts");
  const { processOne } = await import("../../../artifacts/api-server/src/extraction/worker.ts");
  const root = "#capture/threads";
  const url = origin + "/";
  const count = async (table) => (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`, [uid])).rows[0].n;
  const taskCount = await count("focus_tasks");
  const login = (value) => send("Network.setCookie", { name: "focus_session", value, url: origin, httpOnly: true, sameSite: "Lax" });
  async function visit(id) {
    await evaluate(`location.hash=${JSON.stringify(root + "/" + id)}`);
    await until("document.querySelector('.tl-thread-detail')");
  }
  async function fixture(title, source, graph) {
    const doc = randomUUID(), revision = randomUUID();
    await pool.query("INSERT INTO threadline_documents(id,user_id,title) VALUES($1,$2,$3)", [doc, uid, title]);
    await pool.query("INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,$2,$3,1,$4)", [revision, uid, doc, source]);
    const run = await extract(uid, revision, randomUUID(), "mock", 3);
    assert.equal(await processOne({ mode: "mock", generate: async () => JSON.stringify(graph) }, run.id), true);
    return run.id;
  }
  async function active(title) {
    await until(`document.querySelector('.tl-thread-next strong')?.textContent===${JSON.stringify(title)} && !document.querySelector('.tl-thread-detail')?.matches('[aria-busy=true]')`);
  }
  async function terminal(state) {
    await until(`document.querySelector('.tl-thread-heading .tl-thread-status')?.textContent===${JSON.stringify(state)} && !document.querySelector('.tl-thread-detail')?.matches('[aria-busy=true]')`);
  }
  const complete = (button = "Mark complete") => click(button);
  const openDecision = async () => {
    await active("Derive Maclaurin coefficients");
    await complete();
    await active("Transform a known expansion");
    await complete();
    await active("Solve five representative problems");
    await complete();
    await active("Can you explain four correct solutions?");
  };

  await login(token);
  await viewport(1440, 1000);
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Page.navigate", { url: url + "?thread-fixture" + root });
  await until("document.querySelector('.tl-thread-empty')?.textContent.includes('No saved threads yet')");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('main button')).some(b => /generate/i.test(b.textContent))"), false);

  const failure = await fixture("Calc 2 remedial thread", calcSource, calcPlan());
  const success = await fixture("Calc 2 mastery thread", calcSource, calcPlan());
  const portfolio = await fixture("Portfolio case study", portfolioSource, portfolioPlan());
  const needs = "I need to sort this out.";
  const clarifying = plan(null, null, [needs]);
  clarifying.status = "needs_clarification";
  clarifying.missing_information = ["What needs to be sorted out?"];
  const clarification = await fixture("Clarify the obstacle", needs, clarifying);
  const rejectedSource = "Email a room number.";
  const simple = plan("Send the room number", "email", [rejectedSource]);
  simple.status = "simple";
  simple.success_criteria = ["The sent email contains the confirmed room number."];
  simple.nodes = [action("email", "Email the room number", "Verify the reservation first.", "Send the confirmed number.")];
  const rejected = await fixture("Email note", rejectedSource, simple);

  await send("Page.reload");
  await until("document.querySelectorAll('.tl-thread-index li').length===5");
  await screenshot("threads-index");
  await evaluate(`document.querySelector('.tl-thread-index a[href="${root}/${failure}"]').click()`);
  await until("document.querySelectorAll('.tl-thread-graph-node').length===8");
  await terminal("Pending review");
  assert.equal(await evaluate("document.querySelector('.tl-thread-fixture').textContent"), "Mock data");
  assert.equal(await evaluate("document.querySelectorAll('.tl-thread-connections > path').length"), 8);

  const canvas = "document.querySelector('.tl-thread-canvas')";
  const plane = "document.querySelector('.tl-thread-plane')";
  const projection = `getComputedStyle(${plane}).transform`;
  async function assertAligned() {
    assert.equal(await evaluate(`(()=>{
      const canvas=${canvas}, svg=canvas.querySelector('svg');
      const nodes=[...canvas.querySelectorAll('.tl-thread-graph-node')];
      const paths=[...svg.querySelectorAll(':scope > path')];
      return paths.every((path)=>[0,path.getTotalLength()].every((length,index)=>{
        const point=path.getPointAtLength(length);
        const node=nodes.find(node=>Math.abs(node.offsetLeft+node.offsetWidth/2-point.x)<.1 &&
          Math.abs(node.offsetTop+(index ? -4 : node.offsetHeight)-point.y)<.1);
        if(!node || !path.getAttribute('marker-end')) return false;
        const dot=document.createElementNS(svg.namespaceURI,'circle');
        dot.setAttribute('cx',point.x); dot.setAttribute('cy',point.y); dot.setAttribute('r','.01');
        svg.append(dot);
        const anchor=document.createElement('span');
        anchor.style.cssText='position:absolute;width:0;height:0;left:50%;top:'+
          (index ? (-4-node.clientTop)+'px' : 'calc(100% + '+node.clientTop+'px)');
        node.append(anchor);
        const a=anchor.getBoundingClientRect(), b=dot.getBoundingClientRect();
        anchor.remove(); dot.remove();
        return Math.hypot(a.x-b.x,a.y-b.y)<.2;
      }));
    })()`), true);
  }
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.tl-thread-view button')].map(button => button.textContent.trim())"), ["Graph", "List"]);
  const labelCount = await evaluate("document.querySelectorAll('.tl-thread-edge-label').length");
  assert.ok(labelCount >= 3);
  const fitted = await evaluate(`${canvas}.style.transform`);
  const point = await evaluate("(()=>{const r=document.querySelector('.tl-thread-viewport').getBoundingClientRect();return {x:r.x+15,y:r.y+45}})()");
  async function dragGraph() {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + 32, y: point.y + 22, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + 32, y: point.y + 22, button: "left", clickCount: 1 });
  }
  await evaluate("document.querySelector('.tl-thread-viewport').focus()");
  await key("ArrowUp");
  await dragGraph();
  assert.equal(await evaluate(`${canvas}.style.transform`), fitted);
  await until("document.querySelector('.tl-thread-viewport[data-motion=true]')");
  const face = "document.querySelector('.tl-thread-float')";
  await screenshot("threads-idle-start");
  const sample = await evaluate(`new Promise(resolve => {
    const start = performance.now(), heights = [], frames = [], cameras = new Set(), particlePositions = new Set();
    let previous = start;
    function measure(time) {
      const particle = document.querySelector('.tl-thread-particle').getBoundingClientRect();
      particlePositions.add(Math.round(particle.y));
      cameras.add(${canvas}.style.transform);
      frames.push(time - previous);
      previous = time;
      heights.push(${face}.getBoundingClientRect().y);
      if (time - start < 10200) requestAnimationFrame(measure);
      else resolve({ particlePositions: particlePositions.size, cameraPositions: cameras.size, travel: Math.max(...heights)-Math.min(...heights), frames: frames.length,
        p95: frames.sort((a,b)=>a-b)[Math.floor(frames.length*.95)] });
    }
    requestAnimationFrame(measure);
  })`);
  console.log("Desktop graph idle sample", sample);
  assert.ok(sample.travel > 5);
  assert.equal(sample.cameraPositions, 1);
  assert.ok(sample.particlePositions > 10);
  await screenshot("threads-idle-end");
  await click("Motion On");
  await until("!document.querySelector('.tl-thread-particle') && getComputedStyle(" + face + ").animationName==='none'");
  await click("List");
  await click("Graph");
  await until("document.querySelector('.tl-thread-motion').textContent==='Motion Off'");
  await click("Motion Off");
  await until("document.querySelector('.tl-thread-particle')");
  await click("+");
  const zoom = await evaluate(`${canvas}.style.transform`);
  await evaluate("document.querySelector('.tl-thread-viewport').focus()");
  await key("ArrowRight");
  assert.equal(await evaluate(`${canvas}.style.transform`), zoom);
  await key("ArrowDown");
  const panned = await evaluate(`${canvas}.style.transform`);
  assert.notEqual(panned, zoom);
  await dragGraph();
  assert.notEqual(await evaluate(`${canvas}.style.transform`), panned);
  await assertAligned();
  const neutral = await evaluate(projection);
  const decision = await evaluate("(()=>{const r=document.querySelector('.tl-thread-graph-node[data-kind=decision]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...decision });
  await until(`${projection}!==${JSON.stringify(neutral)} && document.querySelectorAll('.tl-thread-connections > path[data-emphasis=connected]').length===3`);
  assert.ok(await evaluate("document.querySelector('.tl-thread-graph-node[data-emphasis=distant]') !== null"));
  await assertAligned();
  await screenshot("threads-depth-hover");
  await click("−");
  await until("document.querySelector('.tl-thread-viewport[data-can-pan=false]')");
  await click("Fit graph");

  // Native keyboard activation selects a graph node and moves focus to its inspector.
  await key("Tab");
  await evaluate("document.querySelector('.tl-thread-graph-node[data-kind=decision]').focus()");
  await until("document.querySelectorAll('.tl-thread-connections > path[data-emphasis=connected]').length===3");
  await key("Enter");
  await until("document.activeElement.id==='thread-step-heading'");
  assert.equal(await evaluate("document.activeElement.textContent"), "Can you explain four correct solutions?");
  await click("Approve thread");
  await openDecision();
  await assertAligned();
  await screenshot("threads-depth-desktop");
  await screenshot("threads-decision-desktop");
  await click("Fewer than four correct and explainable");
  await active("Correct the recurring mistake");
  assert.ok(await evaluate("!!document.querySelector('.tl-thread-current[data-kind=outcome] .tl-thread-surge')"));
  await click("Report a blocker");
  await input("#thread-blocker-note", "I keep missing the factorial.");
  await click("Save blocker");
  await until("!document.querySelector('#thread-blocker-note') && !document.querySelector('.tl-thread-detail').matches('[aria-busy=true]')");
  await evaluate("document.querySelector('.tl-thread-history summary').click()");
  assert.match(await evaluate("document.querySelector('.tl-thread-history').textContent"), /I keep missing the factorial/);
  await click("Complete and retry");
  await active("Solve five representative problems");
  assert.ok(await evaluate("!!document.querySelector('.tl-thread-current[data-kind=retry] .tl-thread-surge')"));
  await send("Page.reload");
  await active("Solve five representative problems");
  await complete();
  await active("Can you explain four correct solutions?");
  await click("Fewer than four correct and explainable");
  await active("Correct the recurring mistake");
  assert.match(await evaluate("document.querySelector('.tl-thread-retry-info').textContent"), /1 of 2 retries remaining/);
  await screenshot("threads-retry-desktop");
  await complete("Complete and continue");
  await active("Prepare a question about the unresolved error");
  await complete("Complete thread");
  await terminal("Completed");

  await visit(success);
  await terminal("Pending review");
  await click("Approve thread");
  await active("Derive Maclaurin coefficients");
  const stale = await evaluate(`(async()=>{
    const id=${JSON.stringify(success)};
    const previous=await fetch('/api/action-threads/'+id+'/progress').then(r=>r.json());
    const body={operation:'complete',node_id:'derive-basics',expected_version:previous.progress.version,idempotency_key:crypto.randomUUID()};
    const response=await fetch('/api/action-threads/'+id+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return response.status;
  })()`);
  assert.equal(stale, 200);
  await complete();
  await active("Transform a known expansion");
  assert.equal(await evaluate("!!document.querySelector('.tl-thread-burst')"), false);
  assert.match(await evaluate("document.querySelector('.tl-thread-notice').textContent"), /changed elsewhere/);
  await complete();
  await active("Solve five representative problems");
  await complete();
  await active("Can you explain four correct solutions?");

  await viewport(390, 844, true);
  await until("document.querySelector('.tl-thread-linear')");
  await click("Graph");
  await until(plane);
  await evaluate("document.querySelector('.tl-thread-viewport').scrollIntoView({block:'center',behavior:'instant'})");
  await until("document.querySelector('.tl-thread-viewport[data-motion=true]')");
  assert.equal(await evaluate("document.querySelectorAll('.tl-thread-current[data-hot=false] circle').length"), 0);
  await screenshot("threads-motion-mobile");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await until("document.querySelector('.tl-thread-viewport[data-motion=false]')");
  assert.equal(await evaluate(projection), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.tl-thread-graph-node[data-state=complete] .tl-thread-step-mark')).animationName"), "none");
  assert.ok(await evaluate("document.querySelector('.tl-thread-motion').disabled && !document.querySelector('.tl-thread-particle')"));
  await assertAligned();
  await click("+");
  await until("document.querySelector('.tl-thread-viewport[data-can-pan=true]')");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touch = await evaluate("(()=>{const el=document.querySelector('.tl-thread-viewport');el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.x+12,y:r.y+28}})()");
  assert.equal(await evaluate(`!!document.elementFromPoint(${touch.x},${touch.y})?.closest('.tl-thread-viewport')`), true);
  const beforeTouch = await evaluate(`${canvas}.style.transform`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...touch, id: 0 }] });
  await until("document.querySelector('.tl-thread-viewport[data-dragging=true]')");
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touch.x + 28, y: touch.y + 20, id: 0 }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await until(`${canvas}.style.transform!==${JSON.stringify(beforeTouch)}`);
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await screenshot("threads-depth-mobile");
  await click("List");
  await until("document.querySelector('.tl-thread-linear')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.tl-thread-outcome')).transitionDuration"), "0s");
  await screenshot("threads-decision-mobile");
  await click("At least four correct and explainable");
  await active("Practice Taylor and convergence topics");
  assert.match(await evaluate("document.querySelector('.tl-thread-linear li[data-state=unavailable] button').textContent"), /Unavailable/);
  await complete();
  await active("Complete a mixed series set");
  await complete("Complete thread");
  await terminal("Completed");

  await viewport(1440, 1000);
  await visit(portfolio);
  await terminal("Pending review");
  await click("Approve thread");
  await active("Inventory case study material");
  await complete();
  await active("May the screenshots be shown?");
  await click("Permission unavailable");
  await active("Write a text-only walkthrough");
  await complete();
  await active("Review navigation and accessibility");
  await complete("Complete thread");
  await terminal("Completed");
  await screenshot("threads-portfolio-desktop");
  await visit(clarification);
  await terminal("Clarification needed");
  assert.match(await evaluate("document.querySelector('.tl-thread-clarification').textContent"), /What needs to be sorted out/);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.tl-thread-detail button')).some(b=>b.textContent==='Approve thread')"), false);
  await visit(rejected);
  await terminal("Pending review");
  await click("Reject thread");
  await terminal("Rejected");

  const other = randomUUID(), otherToken = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO focus_users VALUES($1,'Other fixture','other@example.invalid')", [other]);
  await pool.query("INSERT INTO focus_sessions VALUES($1,$2,now()+interval '1 hour')", [createHash("sha256").update(otherToken).digest("hex"), other]);
  await login(otherToken);
  await send("Page.navigate", { url: url + "?other-thread-owner" + root + "/" + failure });
  await until("document.querySelector('.tl-error')?.textContent.includes('This Action Thread could not be found')");
  assert.equal(await evaluate(`fetch('/api/action-threads/${failure}/progress').then(r=>r.status)`), 404);
  await login(token);
  const generation = '[aria-label="Action Thread generation"]';
  const button = `document.querySelector(${JSON.stringify(generation + " button")})`;
  const consent = `document.querySelector(${JSON.stringify(generation + " input")})`;
  const headingIs = (title) => `document.querySelector('.tl-processing-view h1')?.textContent===${JSON.stringify(title)}`;
  async function saveGeneration(title) {
    await until("document.querySelector('.tl-new:not(:disabled)')");
    await evaluate("document.querySelector('.tl-new').click()");
    await until("document.querySelector('#capture-source')?.getClientRects().length");
    await input("#capture-title", title);
    await input("#capture-source", calcSource);
    await click("Save brain dump");
    await until("document.body?.innerText.includes('Saved brain dump')");
    const { rows: [document] } = await pool.query(
      "SELECT id FROM threadline_documents WHERE user_id=$1 AND title=$2", [uid, title],
    );
    return "#capture/document/" + document.id;
  }
  async function generate() {
    await until(button);
    assert.equal(await evaluate(`${button}.disabled`), true);
    await evaluate(`${consent}.click()`);
    await screenshot("thread-generation-desktop");
    await click("Generate Action Thread");
    await until(headingIs("Waiting in queue"));
    return evaluate("location.hash.split('/').at(-1)");
  }
  await send("Page.navigate", { url: url + "?thread-generation" + root });
  await until("document.querySelector('.tl-thread-index')");
  const saved = await saveGeneration("Offline generation fixture");
  await until("document.querySelector('#tl-plan-availability')?.textContent.includes('AI Action Plan generation is disabled')");
  assert.equal(await evaluate(`!!${button}`), false);
  simulateAdmission(true);
  await send("Page.navigate", { url: url + "?thread-at-quota" + saved });
  await until("document.querySelector('#tl-thread-availability')?.textContent.includes('allowance has been used')");
  assert.equal(await evaluate(`!!${button}`), false);
  // The v2 suite exhausted this grant in the disposable browser schema.
  await pool.query("UPDATE threadline_beta_grant SET request_limit=100 WHERE user_id=$1", [uid]);
  await send("Page.navigate", { url: url + "?thread-consent" + saved });
  const generated = await generate();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const processing = processOne({ mode: "mock", generate: () => pending }, generated);
  try {
    await until(headingIs("Analyzing your thoughts"));
  } finally {
    release(JSON.stringify(calcPlan()));
    assert.equal(await processing, true);
  }
  await until(headingIs("Ready for review"));
  await evaluate("document.querySelector('.tl-processing-links .tl-review-link').click()");
  await terminal("Pending review");
  await click("Approve thread");
  await openDecision();
  await click("At least four correct and explainable");
  await active("Practice Taylor and convergence topics");

  await saveGeneration("Offline invalid generation fixture");
  const invalid = await generate();
  const broken = calcPlan();
  broken.edges[0].to = "missing-node";
  assert.equal(await processOne({ mode: "mock", generate: async () => JSON.stringify(broken) }, invalid), true);
  await until(headingIs("Processing failed"));
  assert.match(await evaluate("document.querySelector('.tl-processing-card [role=status]').textContent"), /connection pointed to a missing step/);
  await evaluate("document.querySelector('.tl-processing-links .tl-run-link').click()");
  await until("document.querySelector('.execution-workspace')");
  simulateAdmission(false);

  assert.equal(await count("focus_tasks"), taskCount);
  await send("Emulation.setEmulatedMedia", { features: [] });
  console.log("PASS: Action Threads browser graph, keyboard and pointer pan, zoom, mobile list, reduced motion, both Calc outcomes, retry and voluntary exit, conflict reload, convergence, refresh, review, clarification and owner isolation");
  console.log("PASS: default depth styling, two view controls, perspective, hover and keyboard neighbors, edge alignment under pan/zoom, static reduced-motion mobile graph, touch pan and Graph/List switching");
  console.log("PASS: saved Brain Dump to consent, genuine queued and running states, completed graph and decision, validation failure and execution history with offline provider");
}
