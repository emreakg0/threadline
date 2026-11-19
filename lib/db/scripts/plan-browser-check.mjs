// Run only inside the capture harness's isolated PostgreSQL schema.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export async function planChecks({
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
}) {
  const countTasks = async () =>
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM focus_tasks WHERE user_id=$1",
        [uid],
      )
    ).rows[0].n;
  const initialTaskCount = await countTasks();
  const project = randomUUID();
  await pool.query(
    "INSERT INTO focus_projects(id,user_id,name) VALUES($1,$2,'Coursework')",
    [project, uid],
  );
  async function login(value) {
    await send("Network.setCookie", {
      name: "focus_session",
      value,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
  }
  await login(token);
  await viewport(1440, 1000);
  await send("Page.navigate", { url: origin + "/?plan-fixture#capture" });
  await until(
    "document.querySelector('#capture-source')?.getClientRects().length",
  );
  const source =
    "I have a CS assignment due Thursday, need to study Calc 2 power series, want to finish my website this weekend, and should probably email my professor about my missing grade.";
  await input("#capture-title", "Coursework and weekend brain dump");
  await input("#capture-source", source);
  await click("Save brain dump");
  await until("document.body.innerText.includes('Saved brain dump')");
  assert.ok(
    await evaluate(
      "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Develop action plan').disabled",
    ),
  );
  await screenshot("brain-dump");
  const doc = (
    await pool.query(
      "SELECT d.id,s.id AS revision FROM threadline_documents d JOIN threadline_source_revisions s ON s.document_id=d.id WHERE d.user_id=$1 AND d.title=$2",
      [uid, "Coursework and weekend brain dump"],
    )
  ).rows[0];
  await evaluate(
    "document.querySelector('[aria-label=\"Action planning\"] a').click()",
  );
  await until("document.body.innerText.includes('No actions yet')");
  await input(".tl-plan-add input", "Collect assignment instructions");
  await click("Add action");
  await until(
    "document.querySelector('.tl-plan-row')?.textContent.includes('Collect assignment instructions')",
  );
  await click("Dismiss");
  await until("document.querySelector('[data-group=dismissed]')");
  await click("Return to review");
  await until(
    "document.querySelector('[data-group=attention]') && !document.querySelector('[data-group=dismissed]')",
  );

  const { extract } =
    await import("../../../artifacts/api-server/src/extraction/service.ts");
  const { processOne } =
    await import("../../../artifacts/api-server/src/extraction/worker.ts");
  function evidence(quote) {
    const start = [...source.slice(0, source.indexOf(quote))].length;
    return [{ quote, start, end: start + [...quote].length }];
  }
  const actions = [
    [
      "Finish CS assignment",
      "Computer Science",
      "CS assignment due Thursday",
      "Thursday",
      "Thursday needs a calendar date.",
    ],
    [
      "Review Calc 2 power series",
      "Studying",
      "need to study Calc 2 power series",
      null,
      null,
    ],
    [
      "Finish website",
      "Personal project",
      "finish my website this weekend",
      "this weekend",
      "Confirm which date you want to target.",
    ],
    [
      "Email professor",
      "Academic administration",
      "should probably email my professor about my missing grade",
      null,
      "Confirm whether you want to follow up.",
    ],
  ].map(([content, category, quote, deadline_phrase, uncertainty_reason]) => ({
    kind: "action",
    content,
    uncertainty_reason,
    proposal: {
      category,
      deadline_phrase,
      description: null,
      suggested_priority: null,
    },
    evidence: evidence(quote),
  }));
  const output = {
    schema_version: 2,
    blocks: [
      {
        kind: "summary",
        content:
          "Coursework, studying, personal work, and an academic follow-up.",
        uncertainty_reason: null,
        proposal: null,
        evidence: evidence(source),
      },
      ...actions,
    ],
  };
  const run = await extract(uid, doc.revision, randomUUID(), "mock", 2);
  await processOne(
    { mode: "mock", generate: async () => JSON.stringify(output) },
    run.id,
  );
  assert.equal(
    (
      await pool.query("SELECT status FROM threadline_runs WHERE id=$1", [
        run.id,
      ])
    ).rows[0].status,
    "succeeded",
  );
  assert.equal(await countTasks(), initialTaskCount);
  await send("Page.reload");
  await until(
    "Array.from(document.querySelectorAll('.tl-plan-row')).some(row=>row.textContent.includes('Finish CS assignment'))",
  );
  await click("Finish CS assignment");
  await evaluate(
    "document.querySelector('.tl-plan-evidence:not(.tl-plan-summary .tl-plan-evidence)').open=true",
  );
  await until("document.body.innerText.includes('CS assignment due Thursday')");
  assert.equal(
    await evaluate(
      "document.querySelector('.tl-plan-form select[name=schedule]').value",
    ),
    "unresolved",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.tl-plan-form button[value=approve]').disabled",
    ),
  );
  await screenshot("plan-desktop");
  await viewport(390, 844, true);
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.tl-plan-detail')).animationName",
    ),
    "none",
  );
  await screenshot("plan-mobile");
  await viewport(1440, 1000);
  await send("Emulation.setEmulatedMedia", { features: [] });

  const field = (name) => ".tl-plan-form [name=" + name + "]";
  await input(
    field("description"),
    "Read the rubric and submit the assignment.",
  );
  await input(field("project_id"), project);
  await input(field("priority"), "high");
  await input(field("schedule"), "scheduled");
  await until("document.querySelector('.tl-plan-form [name=due_date]')");
  await input(field("due_date"), "2026-11-26");
  await click("Save and approve");
  await until(
    "document.querySelector('[data-group=scheduled] .tl-plan-row')?.textContent.includes('2026-11-26')",
  );
  await click("Review Calc 2 power series");
  await input(field("description"), "My pending study notes");
  await evaluate("location.hash='#capture/document/" + doc.id + "'");
  await until(
    "document.querySelector('#capture-source')?.getClientRects().length",
  );
  await evaluate("location.hash='#capture/plan/" + doc.id + "'");
  await until(
    "document.querySelector('.tl-plan-detail')?.getClientRects().length",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.tl-plan-form [name=description]').value",
    ),
    "My pending study notes",
  );
  const calc = (
    await pool.query(
      "SELECT id FROM threadline_knowledge_blocks WHERE document_id=$1 AND content='Review Calc 2 power series'",
      [doc.id],
    )
  ).rows[0];
  const planPath = "/api/plans/" + doc.id + "/" + calc.id;
  const externalEdit = {
    title: "Review Calc 2 power series",
    description: "Saved by another editor.",
    category: "Studying",
    project_id: null,
    priority: null,
    schedule: "unscheduled",
    due_date: null,
    state: "needs_review",
    version: 1,
  };
  assert.equal(
    await evaluate(
      "fetch(" +
        JSON.stringify(planPath) +
        ",{method:'PATCH',headers:{'Content-Type':'application/json'},body:" +
        JSON.stringify(JSON.stringify(externalEdit)) +
        "}).then(r=>r.status)",
    ),
    204,
  );
  await click("Save draft");
  await until(
    "document.body.innerText.includes('This action changed elsewhere')",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.tl-plan-form [name=description]').value",
    ),
    "My pending study notes",
  );
  await click("Reload saved details");
  await until(
    "document.querySelector('.tl-plan-form [name=description]').value==='Saved by another editor.'",
  );
  await input(field("project_id"), project);
  await input(field("priority"), "medium");
  await click("Save and approve");
  await until(
    "document.querySelector('[data-group=ready] .tl-plan-row')?.textContent.includes('Review Calc 2 power series')",
  );
  await until(
    "document.activeElement.textContent.includes('Review Calc 2 power series')",
  );
  await screenshot("plan-groups");
  await click("Create task");
  await until(
    "document.querySelector('[data-group=tracked] .tl-plan-row')?.textContent.includes('Review Calc 2 power series')",
  );
  await click("Finish CS assignment");
  await click("Create task");
  await until(
    "document.querySelectorAll('[data-group=tracked] .tl-plan-row').length===2",
  );
  const task = (
    await pool.query(
      "SELECT id,status,city_slot,to_char(due_date,'YYYY-MM-DD') AS date FROM focus_tasks WHERE user_id=$1 AND title=$2",
      [uid, "Finish CS assignment"],
    )
  ).rows[0];
  assert.equal(task.status, "todo");
  assert.equal(task.date, "2026-11-26");
  assert.ok(task.city_slot > 0);
  const linked = (
    await pool.query(
      "SELECT block_id FROM threadline_action_task_links WHERE task_id=$1",
      [task.id],
    )
  ).rows[0];
  const duplicate = await evaluate(
    "fetch(" +
      JSON.stringify(
        "/api/plans/" + doc.id + "/" + linked.block_id + "/convert",
      ) +
      ",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:2,confirm:true})}).then(r=>r.json())",
  );
  assert.deepEqual(duplicate, { task_id: task.id, created: false });
  await input(".tl-plan-task select", "done");
  await until("document.body.innerText.includes('1 of 2 linked tasks done')");
  await screenshot("plan-tracking");
  await send("Page.reload");
  await until("document.body.innerText.includes('1 of 2 linked tasks done')");
  await click("Finish CS assignment");
  await evaluate("document.querySelector('.tl-plan-task a').click()");
  await until(
    "document.querySelector('dialog[open] [aria-label^=\"Task details: Finish CS assignment\"]')",
  );

  await screenshot("tasks-linked-desktop");
  await send("Page.navigate", {
    url: origin + "/?legacy-link#city/task/" + task.id,
  });
  await until(
    "document.querySelector('dialog[open] input[name=title]')?.value === 'Finish CS assignment'",
  );

  await evaluate("location.hash='#capture/run/" + run.id + "'");
  const actualEvents = (
    await pool.query(
      "SELECT count(*)::int AS n FROM threadline_execution_events WHERE run_id=$1",
      [run.id],
    )
  ).rows[0].n;
  await until(
    "document.querySelectorAll('.execution-event').length===" + actualEvents,
  );
  assert.ok(await evaluate("document.body.innerText.includes('MOCK ADAPTER')"));
  assert.ok(
    await evaluate(
      "document.body.innerText.includes('Action planning · schema v2')",
    ),
  );
  const failed = await extract(uid, doc.revision, randomUUID(), "mock", 2);
  await processOne(
    {
      mode: "mock",
      generate: async () =>
        JSON.stringify({
          schema_version: 2,
          blocks: [
            {
              ...actions[0],
              evidence: [{ quote: "Thursday", start: 0, end: 8 }],
            },
          ],
        }),
    },
    failed.id,
  );
  assert.equal(
    (
      await pool.query("SELECT error_code FROM threadline_runs WHERE id=$1", [
        failed.id,
      ])
    ).rows[0].error_code,
    "EVIDENCE_MISMATCH",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM threadline_knowledge_blocks WHERE originating_run_id=$1",
        [failed.id],
      )
    ).rows[0].n,
    0,
  );

  const visitor = "phase-5a-other-" + randomUUID();
  const foreignToken = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO focus_users VALUES($1,'Other tester','other@example.invalid')",
    [visitor],
  );
  await pool.query(
    "INSERT INTO focus_sessions VALUES($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(foreignToken).digest("hex"), visitor],
  );
  await login(foreignToken);
  await send("Page.navigate", {
    url: origin + "/?plan-other#capture/plan/" + doc.id,
  });
  await until("document.body.innerText.includes('Brain dump not found')");
  assert.deepEqual(await evaluate("fetch('/api/tasks').then(r=>r.json())"), []);
  console.log(
    "PASS: saved brain dump, manual plan, mock v2 evidence/uncertainty, user-picked date, approval, idempotent task conversion, task progress and linked Tasks editor, historical records, malformed output and foreign-session isolation",
  );
}
