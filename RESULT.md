# Threadline Stage 3 — Gemini Action Thread evaluation

**Implemented and awaiting renewed owner authorization.** The development-only
workflow is ready for the bounded evaluation. This session made **0 actual
Gemini requests**. No live v3 graph was generated or scored.

## Authorization and release boundary

- Confirmed the connection matches the Replit development runtime and verified
  migration `0010_threadline_action_threads.sql` in its ledger. The singleton
  owner grant has a 100-request ceiling and 3 used, matched by three dispatch
  records for the same owner and grant. Its expiry was
  `2026-11-20T23:38:35.931Z`. The private provider approval expired at
  `2026-11-20T23:37:35.931Z`. The old balance of 97 is unusable while expired.
  The development database has zero live v3 dispatches and zero saved graphs.
- Checked the local key against the protected approval and verified its
  recorded Free Tier project and `gemini-3.5-flash-lite` model binding.
  Current Google billing status requires the owner's console confirmation.
  No model, key, billing, runtime authorization or deployment changes were made.
- The v3 gate requires an explicit development runtime and a v3-scoped approval
  loaded from the protected, deployment-ignored authorization file. The
  `NODE_ENV=production` path rejects v3. Tests exercised the production gate
  locally. This session used only the development database and disposable test
  schemas.
- An authenticated owner must explicitly consent for each saved source
  revision. The durable queue preserves idempotency, keeps the existing beta
  and rate limits, and reserves at most three v3 slots across the database.
  The worker enforces the cap again in the transaction that debits the beta
  grant and stamps the run. Failed or uncertain transport attempts consume a
  slot, and a stop immediately after debit may also consume a slot. No Gemini
  request is automatically retried. The scoped approval leaves legacy live
  dispatch closed during this evaluation.

## Offline verification

- The real request builder and adapter sent the v3 request to an in-process
  stub. The suite asserted JSON Schema, a 4,096 output-token ceiling and the
  exact wire payload. Gemini itself has yet to accept the schema or return
  token usage. The v3 parser distinguishes `MAX_TOKENS` from other incomplete
  responses. Safe server diagnostics record the output ceiling and numeric
  candidate/thought token counts when Google supplies them.
  [Gemini GenerateContent API reference](https://aistudio.google.com/api-reference/generate-content)
- All 38 graph contract cases passed. The PostgreSQL adapter test saved a
  complete Calc 2 fixture with seven actions, one decision, grounded excerpts
  and a bounded remediation loop. A missing edge destination and a truncated
  fixture saved zero graph rows. An injected database failure rolled back the
  full graph. All fixture data was isolated and removed after the tests.
- Offline checks covered disabled and production authorization, wrong owner,
  expired grant and provider approval, quota exhaustion, duplicate admission,
  switch-off before dispatch, and the transaction's refusal of a fourth debit.
- Workspace typecheck, frontend and API builds, full API/PostgreSQL and
  frontend tests, migration upgrade/re-run, Vite security, seven secret-audit
  regression cases, and package audit passed.
- Authenticated Chromium exercised the disabled and quota states, explicit
  consent, queued and running updates, graph review, approval, a decision,
  validation failure, and recorded execution. Existing Brain Dump, v2
  Action Plan, Tasks, replay, graph, keyboard and mobile checks passed.
  Inspected the desktop consent and mobile graph screenshots.
- The full-history credential audit found three matches for the same
  pre-existing authorization metadata blob in local history. The tracked
  files, staged changes and history reachable from `main` were separately
  checked for the private push.

## Live planning rubric

Each completed live response will be scored 0–5 for action specificity,
practical usefulness, logical sequencing, decision/branch quality, and
grounding/factual fidelity. The maximum is 25. Save a concise rationale for
each score and compare the actual next steps with the existing v2 baseline.
The three scores remain pending because there are no live responses.

| Synthetic scenario | Score | What to evaluate |
| --- | --- | --- |
| A · Calculus II exam | Pending / 25 | Address Maclaurin construction and manipulation first. Check observable practice, mastery, useful remediation, and progress through Taylor and convergence topics. |
| B · Portfolio website | Pending / 25 | Check requirements, case studies before presentation, a realistic build/test/deploy sequence, and a meaningful branch when a blocker exists. |
| C · Weekly organization | Pending / 25 | Collect exact commitments, prioritize work, and check capacity or conflicts. Preserve the uncertainty about dates and times. |

### Exact evaluation inputs

**A.** I have an upcoming Calculus II exam covering Maclaurin series, Taylor series, absolute convergence, and the ratio and root tests. I understand convergence tests better than series expansions, but I struggle to construct and manipulate Maclaurin series. I need a realistic study plan.

**B.** I need to build a portfolio website for internship applications. I have two coding projects but no case studies. I want something I can deploy and show recruiters. I'm not sure which steps to prioritize.

**C.** I have classes, a part-time job, and several assignments due next week. My schedule feels disorganized. I need a repeatable way to prioritize coursework without missing deadlines, but I haven't listed the exact times yet.

## Next unfinished task

The owner must explicitly approve a new time window for these three synthetic
requests and reconfirm in Google AI Studio that the same key's project is on
the Free Tier without paid billing. An administrator can then renew
`starts_at` and `expires_at` on the **same** development singleton grant,
preserving its ID, owner, 100-request ceiling and used count. Renew the
protected provider approval for the same project, model and key binding for
at most 24 hours, ending one minute before the database grant. In the API
server's ignored 0600 `.local/threadline-gemini-authorization.json`, opt in
with numeric `schemaVersion` set to `3` and `liveAuthorized` set to `true`.
Run only the development API with `NODE_ENV=development` and no existing
Gemini authorization Secrets overrides, which take precedence over the file.
Set `liveAuthorized` to `false` in the private file to stop new dispatches
without restarting. A request already sent to Google can still complete.

With renewed authorization, submit one scenario at a time. Save the Brain
Dump, check the Google consent box, and click **Generate Action Thread**.
Check **Recorded execution** for timing and failure category. Use **Review
Action Thread** to inspect the graph and evidence, then explicitly approve or
reject it. Verify the reported token counts and exact saved graph fields.
Count every provider attempt toward the three-request cap and pause after a
failure for offline diagnosis. Record only summarized evidence and scores.

## Files changed

- API and worker
  - `artifacts/api-server/src/extraction/gemini.ts`
  - `artifacts/api-server/src/extraction/beta.ts`
  - `artifacts/api-server/src/extraction/service.ts`
  - `artifacts/api-server/src/routes/action-threads.ts`
- Frontend
  - `artifacts/productivity-app/src/CaptureEditor.tsx`
  - `artifacts/productivity-app/src/ExtractionPanel.tsx`
  - `artifacts/productivity-app/src/PlanProcessing.tsx`
  - `artifacts/productivity-app/src/action-threads/ActionThreads.tsx`
- Offline verification
  - `artifacts/api-server/src/action-thread/integration.test.ts`
  - `artifacts/api-server/src/extraction/authorization.test.ts`
  - `lib/db/scripts/capture-browser.mjs`
  - `lib/db/scripts/thread-browser-check.mjs`
- Continuity
  - `RESULT.md`
  - `PROJECT_STATUS.md`
  - `DEVELOPMENT_LOG.md`

## Previous milestone

### Threadline Stage 2B — Interactive Action Threads

Capture now links to **Action Threads** at `#capture/threads`. Saved threads
open at `#capture/threads/<id>` and restore the server's active step on reload.
The page explains that live v3 generation is disabled and shows saved graphs,
including review, progress, completion, rejection and clarification states.

## Workspace and progress

- A layered 2D layout draws conditional arrows, converging paths and dashed
  retry loops. The graph supports pointer and keyboard pan, zoom, fit and
  node selection. A linear list is the default on narrow screens and is
  available at any width.
- The inspector shows the selected step, its completion or decision criterion,
  exact source evidence, assumptions and open questions. The current next step
  appears above the graph. Only server-permitted actions appear as controls.
- Review and progress use the authenticated v3 API with expected versions and
  idempotency keys. A conflict refreshes the saved path and asks the user to
  review the active step. An unconfirmed write can be retried with the same key.
- Completing a remedial step can take its validated forward exit at any time.
  **Complete and retry** remains available while that edge has attempts left.
  Retry counts remain cumulative across refresh and concurrent requests.
- The existing Brain Dump, Action Plan, Tasks and How It Works remain
  available in Capture. The graph uses React, HTML and SVG with no additional
  dependency.

## Development and verification

- Verified that the configured connection matches the Replit development
  runtime and the previously confirmed development database. Applied migration
  0010 through the existing runner and confirmed its ledger entry. The
  development beta grant remained present. The development thread list held
  zero records after application.
- Chromium exercised the authenticated graph and list with disposable, labelled
  mock data. Both Calc 2 outcomes were chosen explicitly and both threads
  completed. The remedial path retried once and then continued with an attempt
  remaining. A portfolio plan converged after the selected branch. The harness
  covered approval, rejection, clarification, refresh, owner isolation,
  stale-version refresh, pointer and keyboard pan, zoom, native keyboard
  selection, mobile and reduced motion. Desktop and mobile captures were
  inspected at 1440 px and 390 px respectively.
- The full Capture Chromium suite also passed its Brain Dump, existing
  Action Plan, Tasks and persisted How It Works replay cases.
- Passed workspace typecheck, API/PostgreSQL tests including 38 graph
  cases, migration upgrade and re-run, frontend layout/replay tests,
  both builds, frontend security, secret-audit regressions and package audit.
  No Gemini requests or deployment.

Stage 2B ends here. Saved threads are usable through the Action Threads UI.
The development list has no fixtures. Live v3 schema acceptance and planning
quality still require a separate authorized evaluation.

## Earlier Stage 2A — Action Thread persistence and backend

Stage 2A connects v3 to the authenticated API and durable extraction worker.
The normal API's v3 submission and transport gates return
`THREAD_LIVE_DISABLED`. An offline test harness exercises the same services
with authenticated sessions, a disposable owner grant and a mock provider.
The existing v1/v2 request, Action Plan, task and replay paths remain in use.

## Storage and processing

- Migration `0010_threadline_action_threads` adds
  `threadline_action_threads`, `threadline_action_thread_nodes`,
  `threadline_action_thread_edges`, `threadline_action_thread_progress` and
  `threadline_action_thread_transitions`. Composite foreign keys tie the
  proposal to the exact run, source revision and owner. Ordered nodes and
  edges reconstruct the validated graph. Source excerpts retain their
  provenance and offsets.
- The worker selects pipeline `action-thread-3` and prompt `action-thread-1`.
  Its v3 estimate uses the serialized request bytes, output ceiling and
  framing allowance under the existing shared quota rules. The live guard
  precedes key access, beta debit and network transport.
- The worker validates the whole graph, then commits the validated proposal,
  progress row and completed run together. How It Works reads the existing
  source-validation, extraction, output-validation and persistence stages,
  timestamps, durations and errors. Provider response text is transient.
- User progress is recorded in a separate append-only transition history,
  with an optimistic version and one current node. Each decision selects
  one outcome. Converging branches accept arrival from either path.
  Completing a terminal action completes the thread. A blocker records
  a note at the current node. A retry completes the remedial step and takes
  its declared retry edge. Counts come from committed retry transitions
  under the same row lock. Once the cap is reached, completing the remedial
  step takes the declared forward exit.

## Authenticated API

All paths below are under `/api/action-threads`. Requests use the existing
session, write-origin and owner checks. A thread ID equals its run ID.

| Method and path | Contract |
| --- | --- |
| `POST /` | `source_revision_id`, `idempotency_key`, `consent: true`. Returns the queued run ID when admission is enabled. Live v3 returns 503. |
| `GET /?offset=0` | Up to 50 owned threads with review state and version. |
| `GET /:id` | Exact validated graph with evidence and current review state. |
| `POST /:id/review` | `operation: approve` or `reject`. Approval starts at the entry node. A clarification-only proposal can be rejected while the owner revises the source. |
| `GET /:id/progress?after_version=0` | Current state, active next step and allowed operations, plus a page of completion, decision, blocker and retry records. |
| `POST /:id/progress` | `operation: complete\|decide\|block\|retry` and `node_id`. Decisions include the selected outcome's `to_node_id`. Blockers include `note`. |

Review and progress commands require `expected_version` and
`idempotency_key`. An exact duplicate returns the current snapshot with
`replayed: true`. A stale version or an invalid transition returns a
specific 409 code. Unowned thread IDs return 404. A second submission key for
the same pinned revision returns `THREAD_REQUEST_EXISTS`; its existing run
is discoverable via `GET /api/extractions?source_revision_id=<id>`.
Run progress, cancellation, steps and events use the existing extraction API.

## Persisted Calc 2 fixture

An authenticated mock run stored seven actions and one decision, grounded in
two excerpts from the saved midterm note. The API returned the same validated
graph after editing the brain dump into a new revision and after restarting
the HTTP listener. Both mastery outcomes were executed through the API:
four explainable answers unlocked Taylor/convergence and mixed practice;
the other path recorded a blocker, consumed two retries and exited to
preparing a feedback question. An independent portfolio graph tested two
alternative routes into one common review step.

## Verification and next stage

- Passed 38 v3 graph validation cases and the authenticated disposable
  PostgreSQL acceptance test. It covered concurrent requests, ownership,
  provenance, persistence, atomic rollback, traced stages, provider failure,
  cancellation, timeout, lease recovery and the closed live gate.
- Passed the migration upgrade and repeat-run test, v1/v2 API and durable
  worker tests, frontend/replay tests, workspace typecheck, both builds,
  frontend security, secret-audit regressions and package audit. Test graphs
  used mock responses. Zero Gemini requests and zero task creations occurred
  during the v3 acceptance run.
- Migration 0010 was exercised in disposable schemas. Before Stage 2B,
  apply it to the intended environment through the migration runner and
  obtain separate approval for any v3 live evaluation. Provider schema
  acceptance, planning quality and live latency remain unverified.

## Earlier Stage 1 — Action Thread planning engine

Stage 1 adds an offline v3 planning contract and validator. It leaves the v1/v2
request, persistence, review and replay paths in use. The new module builds a
Gemini structured-output payload and validates supplied JSON without provider
transport, database writes, worker registration or a new API route.

## Version 3 contract

- A thread has a goal, success criteria, entry node, actions and decisions,
  directed edges, assumptions and missing-information questions. Nontrivial
  plans have 3–8 actions and up to 3 decisions. Simple plans have 1–2 actions.
  Clarification-only responses return questions and an empty graph.
- Nodes have stable graph-local IDs independent of display order, titles,
  descriptions and observable completion criteria. Decisions require 2–3
  distinct outcome labels and destinations. Converging paths represent
  alternative routes into a step.
- All nodes must be reachable from entry without retry edges, and those
  forward edges form a DAG. Each retry returns to a node on every forward
  route to the remedial action and allows 1–3 total traversals per execution.
  At most two retry edges are allowed. The remedial action has a forward exit
  for when its retry budget is exhausted.
- Exact, uniquely occurring excerpts and any stated deadline phrase carry
  source provenance and locally computed Unicode code-point offsets.
  The goal and nodes carry AI strategy provenance. Excerpts can retain
  conditional wording without classifying it as a confirmed commitment.
  Strategy text still requires semantic review.

## Validated Calc 2 fixture

Derive the Maclaurin coefficients for e^x and sin(x), then practice substitution
and term-by-term integration. Solve five representative problems independently.
Count correct solutions that the student can explain.

- **Four or more** → Practice Taylor expansions about a nonzero center,
  absolute convergence, and the ratio and root tests. Finish with a mixed set
  and justify the center or test used on each problem.
- **Fewer than four** → Classify errors, rework one example, and try a fresh
  set. After two retries, prepare a question about the first unresolved error.

## Files and verification

- `artifacts/api-server/src/action-thread/` contains the contract, graph
  validator, request builder, synthetic fixtures and tests.
- `artifacts/api-server/src/extraction/validation.ts` exports the existing
  field, text and quote-grounding checks for reuse. The API package runs the
  v3 suite alongside existing offline tests.
- 38 v3 cases passed, covering Calc 2, portfolio planning, weekly scheduling,
  simple requests, clarification, conditional commitments and malformed or
  injection-shaped output. Existing API/PostgreSQL integration and worker
  tests, frontend and replay tests, typecheck, both builds, frontend security,
  secret-audit regressions and package audit passed.
- The source uses a shallow Gemini JSON Schema with strict checks performed
  locally. Zero Gemini calls were made. Provider acceptance, planning quality,
  and model behavior on prompt injection require authorized live evaluation.
  [Gemini structured output documentation](https://aistudio.google.com/docs/structured-output)

## Stage 2 prerequisites

Obtain separate authorization for a bounded v3 evaluation with synthetic
inputs. Measure useful specificity, source fidelity, decision quality, and
output size against the worker's reservation rules. Design additive graph
persistence and version-aware replay, including cumulative retry counters and
an explicit owner review path. Keep v1/v2 compatibility and require consent
before live submission and review before task conversion.

## Earlier owner beta budget renewal

- Applied forward-only migration 0009 to development and expanded the existing
  owner grant to **100 total Gemini 3.5 Flash-Lite requests**. The same owner and
  grant retained all three dispatch records and the used count. At verification,
  **3 were used and 97 remained**.
- The 24-hour database window ends **2026-11-20 23:38:35.931 UTC**. The private
  provider authorization lasts 23 hours and 59 minutes, so live eligibility ends
  one minute earlier. Verified the existing owner-confirmed project and local
  model/key binding. Project billing verification relies on the owner's recorded
  confirmation. The renewed authorization is confined to the approved 0600 file.
- The owner daily quota is 100 per Pacific day. Project limits are 240/day,
  10 requests/minute and 180,000 tokens/minute. Owner-only admission, explicit
  consent, atomic accounting and the production block were verified.
- Migration upgrade and repeat-run tests, API authorization, quota/concurrency,
  PostgreSQL integration, workspace typecheck, frontend and security tests,
  both builds, secret-audit regressions and dependency audit passed. Setup and
  verification sent zero Gemini requests.
- The full secret audit flags pre-existing approval metadata outside the
  history reachable from `main`. Current and staged files and the reachable
  `main` history passed review for the private GitHub push.
- Next unfinished task is owner-initiated testing and review of the saved
  evidence during the renewed window. Action Thread redesign remains deferred.

## Earlier security cleanup — Private beta authorization

- Removed both beta authorization values from tracked `.replit`. Preserved the
  exact existing approval in an owner-only, Git-ignored and deployment-excluded
  runtime file; no credential or fingerprint values appear in this report.
- Verified the running API opens both local gates using the private file with
  no legacy environment overrides. Missing, malformed, insecurely-permissioned,
  symlinked or hard-linked files fail closed. Production remains disabled.
- The existing owner, model, three-total-request budget and original expiry
  **2026-11-20 07:12:43.255 UTC** are unchanged. At verification, one request had
  been used and two remained. No provider request or budget reset was performed
  during cleanup.
- Extended the existing audit to inspect the real index separately from the
  working tree, reachable/reflog history and optional retained logs, detecting
  key fingerprints, approval assignments and forced private-file additions.
  Added seven synthetic audit regressions and extended existing gate tests.
- Current staged/tracked files pass. Full history review identified a historical
  `.replit` blob containing the approval and fingerprint, not a raw credential.
  No raw-credential matches were found in checked history, current files or
  available retained logs/workflow tails. Heuristics and retained logs cannot
  establish that inaccessible or deleted logs were clean.
- The full audit intentionally still fails on historical metadata. History was
  not rewritten, the record was not allowlisted and no force-push was attempted.
- Audit/gate regressions, API PostgreSQL integration/worker tests, workspace
  typecheck, frontend/security tests and both production builds passed.
  Package audit found no known vulnerabilities.
- GitHub privacy verification is blocked: the workspace has no accessible GitHub
  connection. This report accompanies a forward-only local cleanup commit; a push
  cannot be verified or performed until access is restored. Preserve the history
  finding for explicit review before any further remote operation.
- Revocation and private-runtime-file details are in GEMINI_INTEGRATION.md.
  Next unfinished task: restore GitHub access, verify repository privacy and
  review the historical audit finding before completing the remote backup.

## Earlier activation report

# Threadline Phase 5C.1 — Development owner beta activated

- Applied existing migration 0008 transactionally to the confirmed development
  database, with migration prerequisites and lock/statement timeouts.
- Matched the owner-provided Google subject to an existing account and unexpired
  session. The owner reconfirmed the unbilled `threadline-gemini` project and key
  association. No billing configuration or provider verification request was made.
- Issued one owner-only grant: three total dispatches, from
  **2026-11-19 07:12:43.255 UTC** to **2026-11-20 07:12:43.255 UTC**.
  At verification, used = 0 and remaining = 3.
- Replaced the two hard-closed switches with development-scoped administrative
  configuration. Approval pins the configured key fingerprint, project, fixed
  `gemini-3.5-flash-lite` model and exact window, failing closed after expiry.
  Production remains disabled. Configuration and credentials are not in this report.
- Reused existing per-revision consent, owner isolation, atomic dispatch debit,
  quotas, deduplication and no-live-retry implementation. No Gemini requests were
  sent during activation or checks.
- Gate-only regressions, API/worker PostgreSQL regressions, workspace typecheck,
  frontend tests/security checks, frontend/API builds and package audit passed.
  The running API logged both gates open after restart; health returned OK.
- Revoke immediately by committing `DELETE FROM threadline_beta_grant` in the
  confirmed development database. Then remove the development-only
  `THREADLINE_GEMINI_LIVE_AUTHORIZED` and `THREADLINE_GEMINI_FREE_TIER_APPROVAL`
  variables and restart API Server. Already-authorized transport cannot be recalled.
- Next: the owner may initiate requests through the app, review original evidence,
  and explicitly approve any resulting tasks. No allowance extension is authorized.

## Earlier readiness report

# Threadline Phase 5C — Controlled personal beta readiness

**Prepared for owner review; live inference is disabled.** No owner was enrolled, no grant was issued in the application database, and no provider request was sent. The normal application retains `LIVE_AUTHORIZED=false` and `freeTierApproval() === null`. The new migration was exercised only in disposable test schemas.

**Proposed first window:** one explicitly named, verified Google account, **three requests total over 24 hours**, with one live request at a time. These values are a proposal requiring separate approval. The owner must specify the account, start and expiry, request allowance, and confirm continued Free Tier eligibility and key/project association before activation.

- **Access and revocation.** Server-side admission checks the signed-in account, grant window, remaining allowance and per-revision consent. Immediately before sending, PostgreSQL checks the pinned revision, current worker lease, original grant and owner, then commits a single debit. Errors after admission consume that debit. Deleting the singleton grant stops subsequent dispatch authorizations across processes. A request already authorized for dispatch can finish. Existing quota reservations, deduplication, 429 cooldown and single-attempt live behavior remain in force.
- **Consent and review.** The submission control requires an initially unchecked consent box for the saved revision and explains Google's Free Tier data use. The API independently requires affirmative consent. A proposal awaiting review opens its original quotation alongside its suggested title, priority, deadline phrase and any recorded uncertainty. Editors still choose a project, priority and schedule before approving and explicitly creating a task.
- **Offline evidence.** Disposable PostgreSQL tests covered owner isolation, expiry, revocation, exhaustion, competing consumers, ambiguous evidence, conditional wording, unresolved dates, and an observation-only source yielding zero actions. Desktop/mobile Chromium exercised consent, the saved Brain Dump button, real queue and processing history with a simulated provider, navigation and reload, review, idempotent conversion and linked-task progress. Manual planning remained available when processing was disabled or failed.
- **Checks.** Workspace typecheck, frontend tests, frontend/API production builds, PostgreSQL integration and worker regressions, the Chromium acceptance suite, frontend security tests and package audit passed. The scoped review removed worker lease and grant fields from run responses. The secret audit found no issues.
- **Limitations.** Exact quotation matching establishes provenance. Human review must decide whether a suggestion preserves qualifiers such as “if” or “probably”, and whether a deadline, priority or proposed action is justified. The beta grant and consent workflow was verified offline; the previous synthetic live pilot is the only verified successful live plan. General AI access remains closed.

## Threadline Phase 5B.5 — Live Action Plan pilot

**One real request produced four persisted, reviewable proposals.** Google returned HTTP 200 and structured JSON to the isolated worker using `gemini-3.5-flash-lite`, v1beta `generateContent`, schema v2 and `grounded-plan-4`. The only source was the approved fictional brain dump, in new revision `17753c1e-6416-423b-92f3-4a6f18061746`. The server key matched the owner-confirmed suffix for the verified Free Tier project.

| Generated topic | Persisted scheduling | Suggested priority |
| --- | --- | --- |
| Programming assignment | Unresolved source deadline | High |
| Calculus review | Unscheduled | Medium |
| Portfolio website | Unresolved “this weekend” | Medium |
| Email project teammate | Unscheduled | Medium |

**Evidence and review.** All four quotations occurred exactly once. After commit, each stored Unicode code-point span reproduced its quotation from the pinned revision. Zero quotations were missing or ambiguous. The authenticated Action Plan API returned all four proposals in `needs_review`. No calendar dates or priorities were approved and zero tasks were created.

**Meaning checks.** The assignment had a grounded deadline phrase and stayed unresolved. The sanitized check did not capture its exact wording as “Thursday”. The teammate email remained a review proposal. The wording check did not establish whether the generated paraphrase preserved “should probably”. Human approval was never exercised in the pilot.

**Execution and closure.** The How It Works API returned 11 ordered events, through successful source validation, extraction, output validation, persistence and completion. An eight-minute, revision-, key-, worker- and model-bound allowance was consumed atomically before dispatch. Exactly one request was sent, with zero retries or fallbacks. The queue was empty at cleanup. The isolated schema and temporary worker were removed after the authenticated read. The ordinary API returned `enabled: false` and `LIVE_DISABLED`; `LIVE_AUTHORIZED=false` and `freeTierApproval() === null` remain in effect.

Focused extraction checks, the PostgreSQL API and worker suites, frontend tests, workspace typecheck, both production builds and the secret audit passed.

This verifies the live path for one synthetic document. It does not establish consistent interpretation across inputs. Further inference requires fresh owner authorization.

## Threadline Phase 5B.4 — Server-grounded source evidence

New planning requests use `grounded-plan-4`. Gemini supplies verbatim quotations as strings. For each quotation, the worker searches the exact immutable source revision and requires exactly one occurrence, including overlapping matches. The server counts Unicode code points before the match and within the quotation to derive a zero-based start and exclusive end. For example, the Chromium fixture persisted “programming assignment due Thursday” at [9, 44).

- **Strict validation.** Model-supplied offsets, absent or ambiguous matches, empty excerpts, malformed evidence and unsupported deadlines fail before persistence. The matcher preserves case, whitespace, punctuation and Unicode representation. Existing block, excerpt and length limits and priority checks still apply. Failures record category codes without quotation or source text. A match establishes where the evidence came from; users still review the proposal’s meaning.
- **Persistence and review.** Desktop and mobile Chromium exercised the exact pilot brain dump against an isolated mock worker. Four proposals persisted with source-revision links and correct spans. Relative dates remained unconfirmed, suggested priorities stayed separate from approved values, and the tentative email remained in review. A run with a valid first action and an invented second quotation persisted zero blocks. Tasks appeared only after explicit approval and conversion.
- **Compatibility and verification.** The v1 validator still checks supplied offsets. Replay tests read v1 events and a historical v2 failure with its original prompt and error code after API restart. Keeping pipeline `plan-2` preserves revision deduplication. Workspace typecheck, frontend/API builds, PostgreSQL integration and worker suites, frontend and security tests, package audit, and secret audit passed. Desktop Action Plan and mobile processing screenshots were inspected.
- **Live boundary.** Zero provider requests. Both gates remain closed. Whether Gemini reliably selects unique verbatim quotations with this prompt remains unverified. The Phase 5B.3 response was discarded, so its specific failing entry is unknown.

## Threadline Phase 5B.3 — Second single-request pilot

**Google accepted the revised structured-output request (HTTP 200). Threadline rejected the generated plan during local evidence validation.** Exactly one Gemini Developer API v1beta `generateContent` request went to `gemini-3.5-flash-lite`, using schema v2 and prompt `grounded-plan-3`. There was no retry or fallback. Google error status and request-field violations are inapplicable to this successful HTTP response.

- **Input and authorization.** The isolated worker used the approved fictional brain dump from new revision `bf3659c6-c5ad-4d3b-8c85-dddce648d02a`. Preflight checked the server key against the owner-verified project key suffix. A ten-minute PostgreSQL allowance bound the revision, model and key. Its atomic consumption committed before the outbound request.
- **Generated output.** The response contained parseable JSON with four action titles. Each expected topic appeared once: the programming assignment, calculus review, portfolio website and teammate email. This topic check did not establish the accuracy of every field or whether the email retained its tentative wording.
- **Validation and persistence.** Exact Unicode code-point evidence validation failed with `EVIDENCE_MISMATCH`. That category covers invalid excerpts, invalid ranges and quotes that differ from the indexed source slice. The specific offending excerpt is unknown. Local validation stopped at that point. Zero proposals, confirmed deadlines, approved priorities or tasks were saved. The relative dates remain unconfirmed.
- **How It Works.** Nine ordered events recorded queueing, startup, successful source validation and extraction, failed output validation and terminal failure. The persistence stage never started.
- **Closure.** The worker counted one outbound request. The allowance was empty, the queue had zero pending jobs, and the disposable schema and temporary worker were removed. The ordinary application retained `LIVE_AUTHORIZED=false` and `freeTierApproval() === null`. The ordinary API regression verified the disabled availability response and HTTP 503 on submission. Focused extraction checks, PostgreSQL API and worker suites, replay tests, workspace typecheck, frontend/API builds and secret audit passed.

The revised request has now been accepted once by the provider. A live, evidence-valid persisted plan remains unverified. The authorization is spent.

## Threadline Phase 5B.2 — Offline diagnosis of Gemini HTTP 400

The pilot established that Google returned HTTP 400. Its response body was discarded, so the cause remains unknown. This investigation sent **zero provider requests**. Both live gates are closed (`LIVE_AUTHORIZED=false`, `freeTierApproval() === null`).

- **Plausible cause.** The pilot schema bounded two nested arrays at 24 blocks and eight evidence excerpts per block. Google documents that nested bounds can make a schema too complex to serve. Another request validation error or project precondition is possible. The historical trace has no detail that distinguishes these explanations. [Google structured-output guide](https://aistudio.google.com/docs/structured-output#simplifying-complex-schemas)
- **Request changes.** The provider schema now describes those limits in words and omits string-length constraints. The local v2 validator still enforces counts, lengths, required fields, priorities, grounded deadlines and exact Unicode evidence. The serialized request matches the documented v1beta JSON request shape, including JSON MIME type, nullable properties and the output token setting. [Gemini REST reference](https://aistudio.google.com/api-reference/generate-content)
- **Diagnostics.** For future HTTP 400s, server logs can identify an allowlisted Google status and affected request fields. Raw text, unknown fields and provider messages are discarded. The run history and user-facing API keep the generic rejection code.
- **Verification.** The exact serialized request fixture, simulated provider responses, PostgreSQL persistence and worker recovery, historical replay, workspace typecheck, frontend/API builds, frontend security tests and package audit passed. Runtime acceptance of the revised schema and quality of live proposals remain unverified. Further inference requires fresh owner authorization.

## Earlier milestones

The Phase 5B.1 pilot sent its one authorized Gemini request. Google returned
HTTP 400, recorded as `PROVIDER_REJECTED`. The run stopped at extraction.

## Integration

- The sole live planning target is `gemini-3.5-flash-lite` through the Gemini
  Developer API `v1beta` `generateContent` endpoint. The request includes a
  pinned text-only prompt and structured schema v2. Local validation still
  checks exact Unicode evidence and requires human review. Historical runs
  and schema v1 replay remain available.
- PostgreSQL admits one live dispatch at a time, spaces reservations by six
  seconds, and enforces 10 requests and 180,000 reserved tokens per rolling
  minute. The daily ceilings are 240 project-wide and 20 per owner, resetting
  at midnight Pacific. The queue caps are 40 project-wide and four per owner.
  Reservations survive restarts and consume quota even if the result is lost.
  A provider 429 pauses dispatch until at least the next Pacific midnight.
- Brain Dump checks availability before enabling **Develop action plan** and
  shows the Free Tier data-use notice before submission. The processing page
  resumes from persisted run state and recorded events, with links to manual
  planning and How It Works. Confirming and creating tasks still require
  explicit user actions.

## Verification

- Workspace typechecks, frontend and API builds, frontend tests, PostgreSQL
  API and migration suites, frontend security checks, dependency audit, scoped
  review, and secret audit passed.
- Isolated fixtures covered concurrent dispatch, spacing, token accounting,
  project and owner caps, 429 cooldown after cancellation, closed-gate
  rejection, ambiguous outcomes, invalid output and evidence, lease recovery
  after a process kill, and persistence rollback.
- Chromium verified queued and active status, reload and navigation, validation
  and persistence event order, ready and failed status, plan review, task
  conversion, owner isolation, and historical replay. Desktop and mobile
  screenshots were inspected, including reduced motion at 390 px.
  Screenshots are in `/tmp/threadline-5b-processing-*.png`.

## Phase 5B.1 pilot outcome

- The owner reconfirmed that `threadline-gemini` was on the Free Tier with
  billing setup still offered, and confirmed the existing server key's
  project association. The server verified the expected key suffix without
  displaying it.
- The pilot applied migration `0007_threadline_gemini_quota` in a disposable
  PostgreSQL schema. It used only the approved fictional text, pinned schema
  v2 and prompt, and `gemini-3.5-flash-lite` at the Gemini Developer API v1beta
  `generateContent` endpoint. The synthetic source revision was
  `43f9dce7-b58a-4f97-aacd-2f661abe2246`.
- Exactly one outbound request was sent. The short-lived isolated worker
  atomically consumed its allowance in PostgreSQL after reserving quota and
  before dispatch. The HTTP 400 response was recorded as
  `PROVIDER_REJECTED`. The provider body was discarded by the adapter, so
  the cause of the HTTP 400 remains unknown.
- Source validation passed. Extraction failed before output or evidence
  validation. The number of generated actions is unavailable. Zero proposals
  and zero tasks were persisted. The authenticated Action Plan read returned
  an empty action list.
- The authenticated How It Works events endpoint returned seven ordered
  records for the actual Gemini run. They showed queueing, startup, source
  validation, and the failed extraction, with no output-validation or
  persistence stages.
- The allowance was consumed and revoked, and the pilot had no pending jobs.
  The temporary worker and disposable schema were removed after verification.
  The normal source still has `LIVE_AUTHORIZED=false` and
  `freeTierApproval()` returning `null`. The API reported disabled and rejected
  a loopback submission with HTTP 503 `LIVE_DISABLED`.

Focused extraction and PostgreSQL integration regressions and the secret audit
passed. No production data, billing settings, or deployment changed. General
availability still requires understanding the HTTP 400 and verifying live
output, evidence, and persistence. The pilot authorization is spent.
