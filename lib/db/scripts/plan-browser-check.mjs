// Run only inside the capture harness's isolated PostgreSQL schema.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export async function planChecks({
  pool,
  simulateAdmission,
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
    "I have a programming assignment due Thursday, need to review calculus for a quiz, want to finish my portfolio website this weekend, and should probably email my project teammate about the missing design files.";
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
  const actions = [
    [
      "Finish programming assignment",
      "Computer Science",
      "programming assignment due Thursday",
      "Thursday",
      "Thursday needs a calendar date.",
    ],
    [
      "Review calculus for a quiz",
      "Studying",
      "need to review calculus for a quiz",
      null,
      null,
    ],
    [
      "Finish website",
      "Personal project",
      "finish my portfolio website this weekend",
      "this weekend",
      "Confirm which date you want to target.",
    ],
    [
      "Consider emailing project teammate",
      "Academic administration",
      "should probably email my project teammate about the missing design files",
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
      suggested_priority: "medium",
    },
    evidence: [quote],
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
        evidence: [source],
      },
      ...actions,
    ],
  };
  await pool.query(
    "INSERT INTO threadline_beta_grant(user_id,starts_at,expires_at,request_limit) VALUES($1,now(),now()+interval '1 hour',3)",
    [uid],
  );
  simulateAdmission(true);
  await send("Page.navigate", {
    url: origin + "/?beta-test#capture/document/" + doc.id,
  });
  await until("document.querySelector('.tl-next-action input[type=checkbox]')");
  assert.ok(
    await evaluate("document.querySelector('.tl-next-action button').disabled"),
  );
  await viewport(390, 844, true);
  await evaluate(
    "document.querySelector('.tl-plan-consent').scrollIntoView({block:'center'})",
  );
  await screenshot("consent-mobile");
  await viewport(1440, 1000);
  await screenshot("consent-desktop");
  const noConsent = await evaluate(
    "fetch('/api/extractions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(" +
      JSON.stringify({
        source_revision_id: doc.revision,
        idempotency_key: randomUUID(),
        schema_version: 2,
      }) +
      ")}).then(r=>r.json())",
  );
  assert.equal(noConsent.error, "CONSENT_REQUIRED");
  await evaluate(
    "document.querySelector('.tl-next-action input[type=checkbox]').click()",
  );
  await click("Develop action plan");
  await until(
    "document.querySelector('.tl-processing-view h1')?.textContent==='Waiting in queue'",
  );
  simulateAdmission(false);
  const run = (
    await pool.query(
      "SELECT id FROM threadline_runs WHERE source_revision_id=$1 AND provider='mock' AND consent_grant_id IS NOT NULL",
      [doc.revision],
    )
  ).rows[0];
  const visibleRun = await evaluate(
    "fetch('/api/extractions/" + run.id + "').then(r=>r.json()).then(r=>r.run)",
  );
  for (const field of ["lease_token", "consent_grant_id", "beta_dispatched_at"])
    assert.ok(!(field in visibleRun));
  await screenshot("processing-queued-desktop");
  let release;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const processing = processOne(
    { mode: "mock", generate: () => response },
    run.id,
  );
  try {
    await until(
      "document.querySelector('.tl-processing-view h1')?.textContent==='Analyzing your thoughts'",
    );
    await screenshot("processing-active-desktop");
    await evaluate("location.hash='#capture/library'");
    await until(
      "document.querySelector('.tl-toolbar strong')?.textContent==='Knowledge'",
    );
    await send("Page.navigate", {
      url: origin + "/?reopen#capture/processing/" + run.id,
    });
    await until(
      "document.querySelector('.tl-processing-view h1')?.textContent==='Analyzing your thoughts'",
    );
    await viewport(390, 844, true);
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await until(
      "innerWidth===390 && document.documentElement.scrollWidth<=innerWidth && getComputedStyle(document.querySelector('.tl-processing-mark svg')).animationName==='none'",
    );
    await screenshot("processing-active-mobile");
  } finally {
    release(JSON.stringify(output));
    await processing;
  }
  await until(
    "document.querySelector('.tl-processing-view h1')?.textContent==='Ready for review'",
  );
  const recordedStages = await pool.query(
    "SELECT payload->>'key' AS stage FROM threadline_execution_events WHERE run_id=$1 AND event_type='step_started' ORDER BY sequence",
    [run.id],
  );
  assert.deepEqual(
    recordedStages.rows.map(({ stage }) => stage),
    ["validate_source", "extract", "validate_output", "persist"],
  );
  const grounded = await pool.query(
    `SELECT b.content,b.uncertainty_reason,b.review_state,e.quote,e.start_offset,e.end_offset,
            a.priority,a.proposal->>'suggested_priority' AS suggestion,a.due_date
       FROM threadline_knowledge_blocks b JOIN threadline_block_evidence e ON e.block_id=b.id
       JOIN threadline_plan_actions a ON a.block_id=b.id
      WHERE b.originating_run_id=$1 AND e.source_revision_id=$2 ORDER BY b.position`,
    [run.id, doc.revision],
  );
  assert.equal(grounded.rowCount, actions.length);
  for (const [index, row] of grounded.rows.entries()) {
    assert.equal(row.content, actions[index].content);
    assert.equal(row.quote, actions[index].evidence[0]);
    assert.equal(
      [...source].slice(row.start_offset, row.end_offset).join(""),
      row.quote,
    );
    assert.equal(row.uncertainty_reason, actions[index].uncertainty_reason);
    assert.equal(row.review_state, "needs_review");
    assert.equal(row.suggestion, "medium");
    assert.equal(row.priority, null);
    assert.equal(row.due_date, null);
  }
  await screenshot("processing-ready-mobile");
  await viewport(1440, 1000);
  await evaluate(
    "document.querySelector('.tl-processing-links .tl-review-link').click()",
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
    "Array.from(document.querySelectorAll('.tl-plan-row')).some(row=>row.textContent.includes('Finish programming assignment'))",
  );
  await click("Finish programming assignment");
  await until(
    "document.querySelector('.tl-plan-evidence:not(.tl-plan-summary .tl-plan-evidence)')?.open",
  );
  await until(
    "document.body.innerText.includes('programming assignment due Thursday')",
  );
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
  await click("Review calculus for a quiz");
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
      "SELECT id FROM threadline_knowledge_blocks WHERE document_id=$1 AND content='Review calculus for a quiz'",
      [doc.id],
    )
  ).rows[0];
  const planPath = "/api/plans/" + doc.id + "/" + calc.id;
  const externalEdit = {
    title: "Review calculus for a quiz",
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
    "document.querySelector('[data-group=ready] .tl-plan-row')?.textContent.includes('Review calculus for a quiz')",
  );
  await until(
    "document.activeElement.textContent.includes('Review calculus for a quiz')",
  );
  await screenshot("plan-groups");
  await click("Create task");
  await until(
    "document.querySelector('[data-group=tracked] .tl-plan-row')?.textContent.includes('Review calculus for a quiz')",
  );
  await click("Finish programming assignment");
  await click("Create task");
  await until(
    "document.querySelectorAll('[data-group=tracked] .tl-plan-row').length===2",
  );
  const task = (
    await pool.query(
      "SELECT id,status,city_slot,to_char(due_date,'YYYY-MM-DD') AS date FROM focus_tasks WHERE user_id=$1 AND title=$2",
      [uid, "Finish programming assignment"],
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
  await click("Finish programming assignment");
  await evaluate("document.querySelector('.tl-plan-task a').click()");
  await until(
    "document.querySelector('dialog[open] [aria-label^=\"Task details: Finish programming assignment\"]')",
  );

  await screenshot("tasks-linked-desktop");
  await send("Page.navigate", {
    url: origin + "/?legacy-link#city/task/" + task.id,
  });
  await until(
    "document.querySelector('dialog[open] input[name=title]')?.value === 'Finish programming assignment'",
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
            actions[1],
            {
              ...actions[0],
              evidence: ["invented deadline"],
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
    "QUOTE_NOT_FOUND",
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

  await evaluate("location.hash='#capture/processing/" + failed.id + "'");
  await until(
    "document.querySelector('.tl-processing-view h1')?.textContent==='Processing failed' && document.querySelector('.tl-processing-view').innerText.includes('A quote did not match')",
  );
  await screenshot("processing-failed-desktop");

  assert.ok(
    await evaluate(
      "document.querySelector('.tl-processing-links a').textContent.includes('Open manual plan')",
    ),
  );
  await pool.query("UPDATE threadline_beta_grant SET used=request_limit");
  simulateAdmission(true);
  await send("Page.navigate", {
    url: origin + "/?quota#capture/document/" + doc.id,
  });
  await until(
    "document.querySelector('#tl-plan-availability')?.textContent.includes('allowance has been used')",
  );
  await evaluate(
    "document.querySelector('.tl-next-action a[href^=\"#capture/plan/\"]').click()",
  );
  await until("document.querySelector('.tl-plan-add input')");
  simulateAdmission(false);

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
    url: origin + "/?isolation#capture/processing/" + run.id,
  });
  await until(
    "document.querySelector('.tl-processing-view h1')?.textContent==='Status unavailable'",
  );

  await send("Page.navigate", {
    url: origin + "/?plan-other#capture/plan/" + doc.id,
  });
  await until("document.body.innerText.includes('Brain dump not found')");
  assert.deepEqual(await evaluate("fetch('/api/tasks').then(r=>r.json())"), []);
  console.log(
    "PASS: saved brain dump, durable processing status and reload, manual plan, mock v2 evidence/uncertainty, user-picked date, approval, idempotent task conversion, task progress and linked Tasks editor, historical records, malformed output and foreign-session isolation",
  );
}
