# Focus City development log

## Reconstructed history (dates unknown)

Git 133c0f1 created the initial repository; 3f10439 initialized the productivity starter and refactored API configuration. Uncommitted work subsequently added Google OAuth, PostgreSQL sessions and migrations, task CRUD, project creation, dashboard, stable city slots, procedural R3F city, compact scenery, architecture, lighting and camera tests. Evidence: source, Git working tree and FOCUS_CITY_SETUP.md. Prior session test claims are historical evidence only, not current verification.

## 2026-11-10 — Recovery audit and persistent memory

- Inspected frontend/backend, OAuth/session handling, migrations, CRUD, procedural city, browser harness, scripts, Git history and pre-existing edits. Preserved all changes.
- Created AGENTS.md, PROJECT_STATUS.md and this log so future sessions can recover architecture, evidence, limits and next steps. Original challenge brief was not found; recovered requirements are identified as provisional.
- Sandbox execution failed before commands started (container bwrap capabilities). Approved execution outside the sandbox enabled local inspection and checks.
- Baseline frontend tests and workspace typecheck passed. Frontend/API builds passed; Vite reported the existing large lazy scene chunk. Started isolated API tests and local software-rendered Chromium verification.
- Next: inspect one-task visuals, repair remaining city issues, verify four task counts and update results.

## 2026-11-10 — Verified visual milestone and continuity checkpoint

- The recovered overhaul already implemented compact neighborhoods, four architecture styles, environmental props, lighting and adaptive framing. Independent browser checks confirmed actual rendering and interaction rather than relying on source presence.
- Fixed camera bounds in src/city/composition.ts to include the platform underside/outer rim, empty-city lamp height and high-priority rooftop accents. Extended layout.test.ts to check actual generated vertical extents and frusta from narrow portrait through ultrawide.
- Tuned CityScene.tsx ambient, hemisphere, warm key and teal fill intensity after inspecting a washed-out one-task screenshot. Preserved on-demand instancing, cached shadows and mobile direct rendering.
- Fixed scenery.ts parked-car color selection: seed modulo 4 always selected the same branch of seed modulo 2; using a higher bit restores both intended colors.
- Replaced stale starter README with actual architecture, startup and checks. Finalized project status and next task. No authentication, database schema or user data changes were needed.
- Verification: workspace typecheck PASS; frontend regression tests PASS; frontend build PASS (988.28 kB scene / 265.33 kB gzip, existing size advisory); backend build PASS. Isolated API integration PASS for persistent task CRUD, ownership isolation, optimistic conflicts, stable/monotonic slots, auth initialization, Google redirect/state, logout and response parsing.
- Chromium software-rendered checks PASS with 0, 1, 5 and 20 real persisted fixture tasks, desktop and mobile: rendering, clicks/inspector/editor when populated, neighborhood and view switching, overflow, WebGL context loss, empty city, no runtime exceptions. Fixtures cleaned by harness. Inspected overview/mobile screenshots, including the attractive one-task composition. Full Google consent and representative physical GPU profiling remain unverified.
- Auth smoke checks also PASS for anonymous access, invalid sessions, request origin protection and invalid OAuth state. Removed a pre-existing trailing blank line from the API entry point to pass patch hygiene checks.
- Local checkpoint preserves all recovered implementation files and these verified changes; staged file-name and credential-pattern checks passed and no secret/environment files are included. Original uncommitted provenance is recorded above. No publishing or deployment performed.
- Next unfinished implementation: ownership-scoped project rename endpoint/UI and integration coverage, then project deletion/task moves. The original Handshake brief must be supplied before claiming complete challenge acceptance.

## 2026-11-10 — Private GitHub source backup

- Inspected the clean main branch, existing history and gitsafe-backup remote. GitHub CLI authenticated as emreakg0; no matching Focus City repository existed. Created https://github.com/emreakg0/focus-city as PRIVATE and configured origin without altering history or the existing backup remote.
- Preserved recovery checkpoint 1a3834e and the actual frontend/backend, migrations, tests, lockfile and project documentation. No application rebuild or runtime changes.
- Expanded .gitignore for Google OAuth downloads, tokens, key files, local GitHub/AWS/SSH credentials, database exports and user-data directories. Existing dependency/build/environment exclusions remain. GitHub CLI credential storage is explicitly ignored.
- Added scripts/secret-audit.py: scans all reachable Git blobs and current tracked files for credential patterns and configured sensitive values, reporting locations without values. Initial history audit: 163 blobs and 144 tracked paths, zero findings. Reviewed the tracked file inventory for credential files/data exports. Pattern checks are heuristic, not a guarantee against all sensitive data.
- Verified the audit in an isolated temporary Git repository: clean history passed; synthetic current and historical-only token markers were detected and redacted. Verified representative ignore paths. Frontend camera/layout/scenery tests and workspace typechecks pass. Prior visual milestone browser/API/build verification remains recorded above; application source is unchanged in this milestone.
- Updated AGENTS.md to automatically commit and push completed verified milestones while preserving privacy and forbidding force pushes/repository deletion without permission. Added GITHUB_BACKUP.md recovery/push instructions and updated README.md and PROJECT_STATUS.md. This is a source backup; live PostgreSQL data and runtime secrets require separate authorized backups and are not uploaded.
- Initial push and remote hash verification follow this setup commit. Next development task remains project rename endpoint/UI with ownership isolation coverage; visual-device/OAuth acceptance limitations remain in status.

## 2026-11-10 — Initial GitHub push confirmed

- Pushed main successfully to the private origin and set its upstream to origin/main. The local and GitHub branch hashes both matched b0fab19c19f4307dfc73d9f5a54df8b1fb2e2d9a. GitHub confirmed PRIVATE visibility and main as the default branch; working tree was clean.
- Configured the local repository's GitHub credential helper to use authenticated gh, with no token embedded in the remote URL or project files. Existing gitsafe-backup remains intact.
- Updated PROJECT_STATUS.md and this log with the observed push result; this confirmation is committed and pushed as a follow-up. No deployment, history rewrite or live data upload occurred.

## 2026-11-10 — Repository exposure audit and hardening

- Confirmed GitHub is private, only owner emreakg0 is listed, with no webhooks or Pages. Repeated history/working-tree secret checks (173 historical blobs at start); no matches. No hosting/access settings changed.
- Found known dependency advisories (7 high, 7 moderate, 2 low). Patched pnpm workspace ranges and lockfile for body-parser, qs, undici and fast-uri; upgraded the Zod catalog to patched v4 and aligned lib/api-spec/orval.config.ts. Kept minimum release age and installed with lifecycle scripts disabled. Final registry audit: zero known findings across 498 dependencies; no remaining peer warning.
- Found arbitrary-host Vite configuration and workspace-wide file access. Added scripts/vite-security.ts with explicit environment-derived hosts and credential deny rules; restricted both frontend configurations to their application directory and node_modules. Added security.test.ts and test:security script to exercise actual hostile-host, credential-file and backend-source requests. Initial Host test used fetch, which did not deliver the intended Host override; corrected it to node:http and verified real 403 responses.
- Added API no-store/nosniff/no-referrer/frame-denial headers, removed X-Powered-By, and rejected writes when APP_ORIGIN is missing. Expanded focus.integration.ts with response-header, cross-account PATCH and invalid/missing-origin checks. Existing persistence and ownership behavior preserved.
- Verification: security regression PASS; API integration and auth smoke PASS; workspace typecheck and city layout tests PASS; frontend/API/mockup builds PASS (existing scene chunk advisory). Six built browser assets contain no matched credential patterns or configured sensitive values. Authenticated one-task browser regression PASS after file-boundary restrictions, including selection/editor, neighborhood/view switching, mobile overflow, context-loss fallback and empty state, with no browser exceptions.
- Added SECURITY_REVIEW.md; updated AGENTS.md and PROJECT_STATUS.md with ongoing checks and limitations. Remaining production security work includes rate limits, input/date validation, deployment TLS/access/CSP review and live OAuth consent. Next product task remains project rename with ownership-scoped API/UI tests.

## 2026-11-10 — Verify and repair four Semgrep supply-chain findings

- Inspected package manifests, .npmrc, pnpm lock/workspace, post-merge/Replit workflows and installed Node 24.22.1 / pnpm 10.26.1 / npm 11.19.1 / Semgrep 1.179.0. No npm install or GitHub Actions workflow found. Retained manager/version and dependency graph.
- Retrieved four public rules at revision 16b9e6d45f10649f6a531ec4838ed9924372c3bc and reproduced all four baseline findings. The release-age rule requires seven days: existing 1440 minutes was below threshold, not an absent-setting false positive. npm finding is operationally inapplicable to the supported pnpm workflow but its supported fallback is now hardened. Public rule severity is MEDIUM with impact HIGH; original hosted artifact unavailable (code-scanning endpoint disabled).
- Added supported blockExoticSubdeps/no-downgrade trust settings, raised cooldown to 10080 minutes, removed blanket vendor exclusions, and set npm's supported seven-day fallback. Preserved build allowlist/peer behavior, moved peer config to YAML, pinned packageManager/engines with strict checks. Replaced destructive preinstall lock deletion with scripts/check-package-manager.mjs, which refuses other installers/locks without deleting files.
- Added scripts/test-supply-chain.py and root test:supply-chain command. Temporary local registry tests PASS for young-release rejection, exact-version exception acceptance/nonspillover, trust downgrade rejection, exotic-subdependency rejection and npm fallback enforcement. Initial fixture expected a different error code and lacked HTTP HEAD; corrected the harness and reran successfully. Separate manager-guard fixtures passed, including preservation of a competing lock.
- CI=true frozen install PASS (unchanged lockfile); workspace typecheck, city tests, Vite security tests, two-account API integration and complete production build PASS. Dependency audit: zero known advisories. Semgrep rerun: 4 rules, 0 findings, 0 errors, no suppressions; metrics/version checks off. No dependencies were upgraded/downgraded.
- Added SECURITY_AUDIT.md with fixed/not-applicable findings, primary references, exact-version emergency procedure, source-reviewed pnpm 10 frozen-lock limitations and remaining production risks. Updated README, AGENTS and project status. No secrets exposed, application deployed or user data removed. Next development task remains project rename API/UI with isolation coverage.

## 2026-11-11 — City-centered interface and fluid task management

- Read AGENTS.md, complete apple-design SKILL.md, status/log, actual frontend/city code and clean Git diff before development. DESIGN.md did not previously exist. Audited excessive vertical marketing/summary space, permanent duplicate editor, weak type hierarchy and the below-canvas inspector.
- Added DESIGN.md documenting the system font hierarchy, ink/slate/mint palette, spacing, material hierarchy, spatial paths, accessibility and verification boundaries. Updated App.tsx and index.css with compact progress/navigation, prominent canvas, refined task rows/status/date presentation, restrained translucent surfaces and responsive controls. Formatted touched source for review and maintenance.
- Added TaskSheet.tsx: native focus-contained dialog with focus restoration, interruptible critically damped spring, matching enter/exit directions, touch drag with pointer capture, release velocity/projection, soft boundary resistance and synthetic-click suppression. Added keyboard creation, success feedback after persistence and inline editor errors. Task creation is disabled until a neighborhood exists.
- Added city/InspectorSurface.tsx and updated CityView.tsx: reversible spring inspector retaining content during dismissal; nonmodal floating desktop inspection and mobile in-flow layout. Retained real Three.js buildings, completion updates/pulses, camera controls, task selector and rendering fallback. No backend or dependency changes.
- Extended lib/db/scripts/city-browser.mjs with configurable CITY_TEST_ORIGIN, visible-inspector selection assertions, desktop/mobile editor screenshots, keyboard create/save through the real API, touch spring-back and reduced-motion Escape checks. Existing 0/1/5/20 coverage is preserved. Corrected synthetic Escape virtual key codes and waited for spring settlement for editor screenshots. Browser write checks exposed the expected hosted/local Origin mismatch, so tests used a separate local API/proxy rather than changing security checks. An initially chosen API port was occupied; used unused port 28081.
- Verification: workspace typecheck PASS; city layout/scenery/camera tests PASS; frontend/API builds PASS (existing lazy-scene size advisory); two-account API integration PASS. All four Chromium count scenarios PASS for desktop/mobile, selection/editor, views/neighborhoods, overflow, WebGL fallback, real task creation/save and reduced motion; an additional one-task touch drag regression PASS. Inspected all four desktop city overview images, selected inspector and mobile city/editor screenshots. Fixtures cleaned by harness; software WebGL does not establish physical GPU performance. Live Google consent remains unverified.
- Updated PROJECT_STATUS.md with evidence and exact remaining design/device acceptance and existing product backlog. No publish/deploy, schema changes, runtime secret changes or user-data cleanup. Next: physical-device interaction/GPU acceptance; product implementation next remains ownership-scoped project rename.

## 2026-11-12 — Continued Apple-design refinement

- Read complete installed apple-design instructions, status/log, design/setup notes and current React/city implementation; inspected Git diff before changes. The existing city-centered redesign was pre-existing work. Preserved untracked .agents/ and skills-lock.json without adding them to this milestone.
- App.tsx and index.css: moved shared search/status controls before both views, added filter reset and accurate empty-state context, current neighborhood semantics, aligned navigation counts, mobile horizontal rail, browser-relative root sizing, larger editor typography and sticky editor header. Keyboard creation now ignores editable content, Alt combinations and repeated keydown events.
- CityView.tsx/InspectorSurface.tsx: improved task-inspector hierarchy and neighborhood context; moved Close to its header; added bounded previous/next browsing and position counts plus Escape dismissal outside the editor. Existing selection continues to control camera focus; mobile spring uses a vertical path and desktop uses a horizontal path. Added explicit reduced-transparency/contrast materials.
- Added ViewSwitch.tsx with independent position/width springs, retained velocity on reversal, ResizeObserver measurement and reduced-motion support. Added spring.ts exact critically damped integration and used it in TaskSheet.tsx and InspectorSurface.tsx as well. Browser checking exposed the old frame-step cap delaying settlement under slow rendering; exact elapsed-time integration removes that dependency. spring.test.ts checks consistent results across frame rates, velocity-preserving reversal and long-frame stability; frontend test command includes it. No new dependencies or lockfile changes.
- Extended lib/db/scripts/city-browser.mjs with inspector browsing/boundaries, shared filters/reset and filtered empty-state assertions, rapid view reversal/selection-surface settlement, mobile inspector screenshots and 20px-root editor overflow coverage. Initial fixed-delay indicator assertion was replaced with an actual settlement condition. Concurrent browser attempts also suspended background-tab animation; final acceptance runs are sequential. Fixtures are isolated and cleaned in finally; production origin protections were preserved using an ephemeral loopback API/proxy.
- Verification: workspace typecheck PASS; city/camera/scenery and spring tests PASS; frontend and API builds PASS; isolated two-account API integration PASS. Existing scene chunk advisory remains 988.28 kB / 265.33 kB gzip. Final sequential Chromium 0/1/5/20 scenarios PASS: rendering, building selection, inspector browsing/boundaries, shared status filtering/reset, filtered empty text, rapid view reversal, mobile overflow/inspection, larger-text editor overflow, touch spring-back, persisted creation/save feedback, reduced motion and WebGL fallback; no browser exceptions. Inspected all four desktop/mobile city screenshots and inspector/editor screenshots. The combined command was terminated during its last scenario; reran 20 separately to completion and explicitly cleaned the interrupted fixture using IDs retained in that test page. No physical-device performance or live Google consent claims; no deploy/publish, schema changes or runtime secret changes.
- Updated DESIGN.md and PROJECT_STATUS.md. Next unfinished design acceptance: physical phone/tablet/laptop navigation, inspector, software-keyboard and GPU checks. Existing project rename/delete/task-move backlog remains outside this milestone.

## 2026-11-16 — Threadline Phase 1 only

- User approved incremental architecture/storage foundation; preserved pre-existing
  untracked artifacts/productivity-app/components.json without staging it.
- Added THREADLINE_ARCHITECTURE.md documenting boundaries, contracts, design tokens,
  integrity responsibilities, deferred AI decisions and non-destructive rollback.
- Added 0003_threadline_foundation.sql and registered it in migrate.mjs. New tables
  only; no existing table changes/backfill. Owner-consistent references, immutable
  source/events, duplicate guards and task-link owner/action checks establish reusable
  storage. Collections are initially flat; exact evidence validation, nested hierarchy,
  content hashes and full-text indexing are explicitly deferred to consuming features.
- Added scripts/threadline-foundation.test.mjs and db test:foundation script. Actual
  migration runner tested twice against populated isolated legacy schema; all original
  fixture rows preserved. Ownership, source/event immutability, run idempotency,
  evidence bounds, event sequence uniqueness and duplicate conversion PASS. Replaced
  initial concurrent single-client snapshot queries with sequential reads to remove
  pg deprecation warning; final rerun PASS. Test schema removed by its own cleanup.
- Typecheck, frontend tests, frontend/API builds, isolated API integration and frontend
  security tests PASS; pnpm audit found no known vulnerabilities. Existing large lazy
  city chunk advisory persists. Reviewed new SQL and diffs; no UI/city changes, browser
  harness unnecessary for this milestone. No live OAuth or physical GPU claims.
- Updated status and RESULT.md as requested. Shared schema not migrated; no installs,
  paid calls, credentials, deployment or rename. Stop for review before Phase 2.

## 2026-11-16 — Threadline Phase 2A: persistent document capture

- Preserved the pre-existing untracked frontend components.json and all city code.
  Reused Express session/origin middleware, pg transactions, same-origin request helper,
  React/native controls and existing Chromium/CDP tooling; no dependencies installed.
- New routes/documents.ts supplies owner-scoped create/list/get/patch/archive/restore
  and paginated revision metadata/exact revision reads. Explicit validation rejects
  invalid fields/types, UUIDs, NUL, malformed Unicode and excessive lengths. Extended
  app.ts to return 413 for the existing body-size limit, and index.ts readiness to 0003.
  Applied existing additive 0003 with the established runner; no existing records
  updated and no new migration needed. New document/source writes are transactional.
- New documents-api.ts validates frontend response boundaries. New useCapture.ts,
  CaptureWorkspace.tsx, CaptureEditor.tsx and scoped capture.css separate state,
  library/navigation and editor/history because existing task forms do not cover
  document revision/conflict behavior. App.tsx adds capture navigation without removing
  City/List. api.ts adds an HTTP-status-bearing error for safe 409 comparison handling.
- New documents.integration.ts runs in a random isolated schema and is included in
  the API test script. PASS: invalid bodies/Unicode/413, auth/origin/no-store, two-owner
  isolation, persistent restart reads, duplicate prevention, concurrent 200/409,
  exact original source, no revision on unchanged text, archive/restore and injected
  revision-write failure rollback. Source UPDATE rejected by existing immutable trigger.
- New lib/db/scripts/capture-browser.mjs is necessary because existing city harness
  has no reusable exported CDP runner. It uses isolated DB/schema and a loopback API/
  frontend proxy; PASS for desktop/mobile capture, uncertain successful write then
  failed response/retry (one document), reload, history, real conflict/local draft,
  archive/restore, reduced motion, no overflow/exceptions and City/Capture round trip.
  Corrected harness reload timing and disabled-button waits rather than adding sleeps.
  Desktop/mobile captures inspected. Split initial component into focused modules;
  final typecheck/build passed after correcting extraction/type errors during development.
- Required typecheck, frontend tests, frontend/API builds, API integration, foundation,
  frontend security and dependency audit PASS. City browser 0/1/5/20 scenarios PASS and
  all desktop/mobile images inspected. Existing 988.28kB city chunk warning persists;
  software WebGL/live local tests do not prove physical GPU performance or Google consent.
- Documented APIs in THREADLINE_ARCHITECTURE.md and visual behavior in DESIGN.md.
  GEMINI_INTEGRATION.md documents future Gemini JSON/evidence/runtime validation,
  rate limits/recovery, server-only secret and strict $0/free-only gate. No credentials
  read/modified, provider requests, billing settings, installs, deploy or repository rename.
  Updated RESULT.md and status; AGENTS.md persists the requested RESULT.md reporting.
- Scoped correctness/security review: parameterized SQL and ownership checks verified;
  no raw HTML rendering, content logging or secret use introduced. No blocking findings.
  Stop after this milestone for review; Phase 2B is not authorized automatically.
- Before commit, noticed concurrently added unstaged Codex efficiency rules in AGENTS.md;
  preserved them separately and staged only this session's RESULT reporting line.
  Secret audit and private-origin check passed; reviewed staged files exclude the
  existing components.json, runtime secrets, screenshots and live database records.
- Concurrent Replit Agent commit 0ee3284 captured the implementation plus previously
  untracked components.json and user-added AGENTS efficiency rules during finalization.
  Preserved that commit; reviewed those additional files and corrected RESULT.md
  provenance. Our follow-up 2b87774 contains reporting additions. No history rewrite.

## Phase 2B — structured extraction with closed live gate

- Read current committed instructions, contracts/status/result, relevant log/schema,
  document/capture code and Git state. Used backend/reuse/token-discipline and scoped
  code/security review guidance. Preserved current functionality and Git history.
- Added extraction/validation.ts (strict JSON, source evidence and code-point bounds),
  gemini.ts (native fetch pinned model/schema with hard-disabled gate), service.ts
  (owner-scoped pinned source, idempotency, DB concurrency/quota limits, truthful
  attempt events and transactional output). Added authenticated routes/extractions.ts
  behind existing Focus middleware. No migration or task/source editing.
- Added ExtractionPanel.tsx and a minimal CaptureEditor insertion, preserving existing
  styles/navigation. Read-only output, data-use notice, dirty/archive safeguards and
  explicit disabled/error feedback. No simulated successful extraction or replay.
- Added extraction.test.ts to API test command; extended documents integration for
  route ownership and browser harness to click Organize and verify LIVE_DISABLED.
  Mock tests verify validation/Unicode/deadline ambiguity, duplicate submit, two owners,
  quota/auth/model/timeout failures, transient retry and rejected block-write rollback.
  All fixtures isolated and cleaned. Corrected a test SQL quoting typo before rerun.
- Typecheck, frontend tests/build, API build/tests, frontend security and pnpm audit
  pass. Capture browser suite passes including disabled action and old workflows.
  Existing large city chunk warning persists. No new city rendering changes.
- Official Google pricing/structured-output/rate-limit/API docs reviewed; selected
  standard text gemini-2.5-flash-lite generateContent, not batch/cache/tools. Public
  pricing is not owner project verification. Live gate remains false; no credentials
  read/modified or provider calls. No installs, billing, deployment or rename.
- Updated architecture/Gemini contracts and completion files. Conservative extractive
  validation is intentional; semantic categorization still needs review. Recovery after
  process kill and full step lifecycle are Phase 2C, not claimed implemented here.

## Phase 2C — durable queue, worker fencing and real event history

- Read current full AGENTS, latest result/architecture/Gemini/status/log, actual
  extraction/schema/API/tests and Git state. No concurrent edits present at inspection;
  no user work discarded. Applied backend, reuse, token-discipline and scoped review
  guidance. Existing schema fields sufficient; avoided a migration/backfill.
- Replaced synchronous service.ts with transactional queued creation. Added lifecycle.ts
  for short transactions, parent-row-locked event allocation, expiry reconciliation
  and owned cancellation. Added claims.ts for bounded capacity/attempt/dispatch checks
  and leased claiming, and worker.ts for abortable adapter waits, heartbeats, staged
  execution, fenced atomic output and one durable known-transient retry. These files
  separate new responsibilities absent from the synchronous implementation.
- index.ts starts the worker after DB readiness. gemini.ts accepts an optional abort
  signal but LIVE_AUTHORIZED=false is unchanged and checked before key access. No
  external inference requests/credential inspection. lib/db exports its existing
  PoolClient type: corrected the initial overload-inference typecheck failure without
  adding packages or duplicating a database client abstraction.
- Extended extraction routes for 202 creation, bounded owned history/steps/events,
  since_sequence cursor and cancellation; kept session/origin middleware. Capture
  polls persisted state, discovers latest revision run, refreshes/cancels without a
  replay interface. Preserved Free Tier notice and truthful disabled-provider feedback.
- Updated Phase 2B tests to drive injected mock workers; added durable.test.ts and a
  child-process fixture because no prior crash/fencing fixture existed. Real SIGKILL
  tested provider wait and blocked result persistence; tests also cover simultaneous
  submits/claims/event writers, cancellation/lease loss, no auto-resend after recovery,
  bounded transient retry/exhaustion, hung-adapter timeout, project quota pause and
  rollback after first block/evidence insertion succeeds but second block fails.
- Document integration verifies foreign run/event/step/cancel rejection and identical
  event reads after HTTP server restart. Capture browser harness starts/stops its
  isolated worker and passes async disabled action plus existing capture workflows.
  Targeted tests then workspace typecheck, frontend tests/build, API build/integration,
  foundation, security and pnpm audit passed. Existing city bundle advisory remains;
  no fresh full city-count browser/physical GPU/live OAuth claims.
- Review tightened dispatch-day quotas, cancelled in-flight capacity reservation,
  DB-clock timings and bounded reconciliation. No DB transaction spans inference;
  parent locks allocate ordered gap-free sequences and fencing rejects late writers.
  Source/tasks unchanged; blocks remain needs_review. No dependencies/config controls,
  paid APIs, deployment, rename or Phase 3. Updated contracts/status/RESULT report.
- Final correctness review found the Phase 1 timing CHECK forced fake started_at for
  a queued cancellation. Added 0004_threadline_terminal_times.sql, registered it and
  updated readiness/foundation count: permits actual completion with unknown/unstarted
  work only for terminal failed/cancelled/interrupted states, without changing records.
  Removed synthetic starts; added queued-cancellation null-start assertion. Migration
  validates expanded check before dropping old check under short timeouts. Retain the
  permissive check on rollback rather than falsifying history to restore the old one.
- Applied 0004 through the existing runner after isolated validation. Restarted the
  local API development workflow after its readiness marker changed; no deployment.

## 2026-11-17 — Phase 3 real trace diagram/replay only

- Read current AGENTS/status/result/contracts/design/log and source endpoint/step/event
  contracts; Git initially clean. Used frontend/UI/reuse/token-discipline, debugger and
  scoped review guidance. Preserved worker/auth/schema/city/source and closed live gate.
- Added trace.ts for projected, validated, all-page trace reads and replay.ts for pure
  sequence-driven timing/state. No existing module handled recorded playback. Added
  HowItWorks.tsx (history/links/refresh), ExecutionReplay.tsx (diagram/controls),
  TraceInspector.tsx (safe metadata) and scoped execution.css; existing capture forms
  and sheet components did not supply these read-only domain views. CaptureWorkspace,
  App and ExtractionPanel add only necessary hash navigation; editor stays mounted.
- Stage states derive from events, not eventual step status. Final metadata is labeled
  separately; missing events are not invented. Legacy keys shown as extra stages.
  Recovery never implies success. Sequence is authoritative; time gaps are clamped
  300–1800ms and labeled as replay rather than real wall time. Native keyboard/touch,
  focus and reduced-motion controls remain usable without animated playback.
- Added replay.test.ts and frontend test entry. Extended isolated browser harness with
  replay-browser-check.mjs: normal mock services generate real successful/retried runs,
  lease expiry/reconciliation and cancellation. Test-only response slicing forces small
  pages without modifying persisted event records. Serialized traces survive reload
  exactly; every UI event ID matches PostgreSQL, and replay run count stays constant.
  Foreign detail/events/steps return 404; injected page error shows no partial trace.
- Browser tests cover play/pause, restart, both step directions, seek/rate change,
  keyboard/touch, reduced motion, history paging and Capture draft preservation. Desktop/
  mobile inspected; fixed inherited aside styling. A reload test initially examined old
  DOM, then the new loading DOM: now waits for changed performance.timeOrigin and full
  expected event count. A test response-wrapper crash was corrected (Express response
  prototype is attached only inside app handling); confirmed/cleaned its orphaned
  isolated fixture schema, leaving all user data intact.
- API test command twice terminated SIGTERM after printing test passes. Hypothesis was
  crash-test CLI signal supervision, not application assertions. Direct Node with the
  installed tsx loader exited 0 for the same durable test; changed only that test script
  invocation. Full API command then exited 0. Document test standalone also exited 0.
- Replay tests, workspace typecheck, frontend tests/build, API tests/build, foundation,
  frontend security and audit passed (no known vulnerabilities). Existing city bundle
  warning persists; city regression unit tests and navigation pass; full count-browser
  and physical-device/live OAuth/deployed checks not claimed. No inference/key access,
  dependencies installed, security/supply-chain weakening, schema migration, rename,
  billing or deployment. Updated continuity/design/contracts and RESULT; stop for review.

## 2026-11-18 — Threadline Phase 4

- App and CaptureWorkspace integrate the existing editor, Library, ReviewPanel,
  Collections, CommandPalette and recorded How It Works. Capture and review
  drafts survive section changes. capture.css scopes the graphite palette,
  focus, mobile layout and motion preferences to Threadline.
- Document queries now match saved titles/latest source text with active,
  archive, collection and tag filters. Organization updates use the document
  transaction and expected version. The review router uses versioned and
  owner-scoped block writes. Migration 0005 records the last human content edit
  while preserving original evidence and run provenance. The normal API entry
  point checks for migration 0005 on startup.
- Extended the document integration suite and capture/replay browser harness
  for the new write, search, focus and concurrency paths. Adjusted inherited
  city heading/select styles, dialog focus and rapid-reopen behavior, and
  narrow history after running the browser and inspecting screenshots.
- Passed workspace typecheck, app tests, API integration/extraction/durability
  tests, foundation migrations, production builds, Vite security checks,
  package audit and isolated desktop/mobile Chromium. The app had zero browser
  exceptions in the harness. The separate City browser checks passed at 0, 1,
  5 and 20 tasks. City rendering code, worker, provider gate and
  legacy data contracts stay intact.

## 2026-11-19 — Threadline Phase 4.1

- Reworked CaptureEditor, ExtractionPanel, and the scoped workspace styles
  around a plain-text manuscript and document tools. Kept the existing save
  and extraction handlers. Added long title wrapping and source-history
  focus restoration.
- CaptureWorkspace and Library reuse one list for Knowledge, Collections,
  and the Review queue. Added a collection navigator and retained the last
  browse view when opening a document. Fixed the collection creation input
  race by preserving the submitted field while the request is pending.
- CommandPalette and ReviewPanel now group real results and separate original
  evidence from block text, with shared icons from WorkspaceIcon. Existing
  inline glyph paths are consolidated there because the shell, palette, and
  list rows now need the same icons. Review adds block jump and local recovery
  without changing block writes. execution.css aligns the replay view with
  the workspace width.
- Extended the capture/replay harness with representative long notes, multiple
  tags and collections, source evidence, and before/after visual checks. Passed
  browser regressions, typecheck, builds, frontend tests, API suites, Vite
  security tests, and package audit. The browser used isolated fixture schemas.

## 2026-11-19 — Threadline Phase 5A

- Reprioritized the roadmap around Action Planning. Brain Dump uses the
  existing capture safety mechanisms and links to the new ActionPlan and
  PlanAction views for manual and mock sources.
- Added schema v2 prompt/validation and worker tuple checks. The worker
  stores original proposals and exact excerpts atomically with run success.
  Evidence validation and archive gates reject unsupported writes. Playback
  displays the recorded schema marker while retaining legacy event ordering.
- Migration 0006 stores plan fields separately and adapts the unique
  action/task link to retain a receipt after normal task deletion. The
  owner-scoped plan router serializes approval and conversion with the
  document and block locks, and reuses the task store and slot allocator.
  Shared Review excludes managed actions so its generic path cannot bypass
  plan approval.
- Linked task status and progress use the existing task API. Returning to
  Focus City refreshes tasks and can open the existing editor at a linked
  task. The planning UI keeps draft edits through navigation and presents
  original uncertainty separately from confirmed scheduling.
- Passed scoped API, migration, frontend and security checks, builds,
  package audit, the complete Chromium flow, and the 0/1/5/20 City suite.
  A CDP reload race was isolated to the browser harness polling transition.
  Fixtures remained inside disposable schemas, and the Gemini live gate
  remained closed.

## Threadline standalone transition

- Made `App.tsx` render Threadline at the root and preserve its workspace
  state across Tasks navigation. Removed the legacy City entry and view
  switch from the active shell and applied Threadline branding to sign-in
  and browser chrome.
- Reused the existing task list and TaskSheet with project creation and
  filtering. Action Plans link directly to task editing, with compatibility
  for previous task hashes. The task API, tables, migrations and City
  source and packages retain their existing contracts.
- Extended the isolated Chromium regression for root routing, mobile task
  management, and both task link forms. Replay and planning assertions now
  verify that the existing task count stays constant before user conversion.
  Chromium, API and frontend tests, typechecks, builds, and security checks
  passed. No real Google consent or Gemini inference was exercised.

## Threadline Phase 5B — Gemini 3.5 Flash-Lite

- Pinned the exact model and revised the schema v2 planning prompt around
  distinct actions, concise evidence, and preserved uncertainty. Historical
  schema/version metadata and replay retain their existing meaning.
- Added additive migration 0007 and PostgreSQL quota accounting to the durable
  queue. Verified revision deduplication, dispatcher serialization, rolling and
  Pacific daily limits, owner queue exhaustion, and a project cooldown after an
  observed 429. Live rejection, timeout, and interruption do not trigger resends.
- Replaced the legacy extraction trigger with availability-aware Action Planning
  and a resumable progress page driven by stored events. Kept manual planning,
  review, task conversion, and replay available. Fixed stale run discovery when
  returning to a previously opened brain dump, and scoped the outbound timeout
  to provider work so storage errors keep their own failure category.
- Passed isolated API/PostgreSQL and Chromium checks, workspace typecheck,
  frontend tests, builds, security and package checks. Inspected desktop and
  mobile views. No live calls, key access, or billing changes.

## Threadline Phase 5B.1 — pilot preflight

- Checked the pinned Gemini 3.5 Flash-Lite Developer API endpoint and key
  presence. Public pricing documented Free Tier model eligibility. No
  authenticated project settings were available to confirm current billing
  status or the existing secret's project association.
- Stopped before dispatch. No synthetic pilot rows, authorization changes,
  or provider attempts were created. Focused isolated document and extraction
  tests passed and verified the normal API still returns `LIVE_DISABLED`.
  This checkpoint updates documentation only.

## Threadline Phase 5B.1 — one-request pilot outcome

- Accepted the owner's current Free Tier and key-origin verification and
  checked the configured secret's suffix without displaying it.
- Applied migration 0007 in an isolated schema, used a short-lived
  single-revision worker authorization, and consumed a durable allowance
  before one real Gemini Developer API call. HTTP 400 was recorded as
  `PROVIDER_REJECTED`. The authenticated events endpoint reported the actual
  failure in order and the Action Plan had no proposals.
- Revoked and removed the pilot authorization and cleaned up only the pilot
  fixtures. Normal live inference remained disabled. Focused extraction and
  document integration checks passed. Only this sanitized report was retained
  in Git.

## Phase 5B.2 — Offline HTTP 400 investigation

Simplified the v2 provider schema, pinned its serialized request, and added bounded, allowlisted HTTP 400 diagnostics in the adapter and worker. The local validator and v1 schema were preserved. Simulated response tests, PostgreSQL integration, worker recovery, replay, typecheck, builds, frontend security and package audit passed. Zero provider requests. Both live gates remain closed.

## Phase 5B.3 — Second authorized pilot

Ran the production planning adapter and durable worker in isolation with the approved source and a key-, model- and revision-bound ten-minute allowance. Committed atomic consumption preceded the sole outbound request. HTTP 200 returned four action topics. The worker recorded EVIDENCE_MISMATCH during output validation and skipped persistence. Verified nine trace events, zero tasks and zero pending jobs, then removed the isolated schema and worker. Only sanitized documentation was retained.

## Phase 5B.4 — Reliable source evidence grounding

Updated the planning request fixture, prompt, validator and processing error messages. New v2 runs derive unique exact source spans in Unicode code points. Added tests for ambiguous overlaps, Unicode, invalid evidence, deadlines, persistence and historical replay. Desktop/mobile Chromium exercised the complete workflow in a disposable schema. Typecheck, builds, PostgreSQL regressions, frontend security and package audit passed. Zero provider requests; both authorization gates remain closed.

## Phase 5B.5 — Third authorized live pilot

Used the committed quote-only adapter and durable worker in a disposable schema with an eight-minute atomic allowance. One HTTP 200 response produced four valid actions and four verified exact spans. Read the committed plan and execution events through authenticated API routes before cleanup. Documented the limits of the deadline wording and tentativeness checks in RESULT.md. Confirmed LIVE_DISABLED, zero pending jobs and removal of pilot resources. Only sanitized documentation was retained.

## Phase 5C — Controlled personal beta readiness

Added migration 0008 and server-side checks tying consent, the authenticated owner, grant budget and worker lease to a single dispatch. Added a revision-specific consent checkbox, source-first review and safe beta error messages. Regression fixtures exercise personal-beta admission with a simulated provider, conditional and observation-only notes, expiry, revocation, budget exhaustion, concurrent spending, and desktop/mobile approval-to-task progress. No application grant, deployment, billing change or live request.

## 2026-11-19 — Phase 5C.1 development owner activation

- Applied existing migration 0008 with transaction, advisory lock, database/schema
  prerequisites and bounded lock/statement times. Preserved all existing data.
- Reused `extraction/gemini.ts` and existing beta admission/debit logic, adding
  development-scoped administrative flags and expiring, key-bound Free Tier
  approval rather than hardcoding account details or credentials.
- Added a gate-only authorization regression file and wired it into API tests;
  ordinary API tests force live dispatch off. Startup logs report only safe gate
  status, never keys, fingerprints or account details.
- Runtime verification identified that the preview workflow carries Replit's
  platform `production` label despite not being a production service. The guard
  uses the service's NODE_ENV production setting instead, with a regression.
- Final pristine window began at 07:12:43.255 UTC and ends exactly 24 hours later,
  with an absolute ceiling of three and zero used at verification. The API
  restarted successfully and logged both local gates open; health returned OK.
- Focused gate checks, PostgreSQL API/worker tests, workspace typecheck, frontend
  tests/security checks and both builds passed. Package audit found no known
  vulnerabilities. All provider outcomes were simulated; zero Gemini requests.
- Updated RESULT.md, PROJECT_STATUS.md and GEMINI_INTEGRATION.md with scope,
  evidence, revocation and the next owner-only action. No billing or deployment
  changes. GitHub access is currently unavailable; no remote push was attempted.

## 2026-11-19 — Secure beta configuration cleanup

- Addressed owner feedback: non-secret development settings had persisted the
  approval and fingerprint into tracked `.replit`. Removed both stored values.
- Moved the unchanged approval/control to the API's ignored `.local` directory
  with owner-only directory/file permissions, explicit deployment exclusion and
  fail-closed loading. Optional Secrets overrides remain supported; partial
  overrides do not inherit file authorization.
- Reused existing gates and accounting; no owner, model, budget, expiry or billing
  changes. Running API authorization and a no-network private-file gate check
  passed. One request was used and two remained at verification.
- Extended the existing secret audit for key fingerprints and beta values,
  actual staged content, historical/reflog blobs and retained logs. Added seven
  synthetic audit regressions and private-file failure-path gate tests.
- Checked history/current files and available retained logs without printing
  values. Found the historical approval/fingerprint record but no raw-credential
  matches. Current index/worktree pass; the default history-inclusive audit
  correctly remains nonzero. No allowlist, force-push or history rewrite.
- Audit/gate tests, PostgreSQL API/worker tests, workspace typecheck, frontend/
  security tests, both builds and package audit passed.
- GitHub privacy lookup reported no accessible GitHub connection. Remote backup
  remains blocked pending restored access and review of the historical finding.

## 2026-11-19 — Expand owner testing budget

- Raised the owner daily ceiling in `extraction/quota.ts` to 100 and added
  forward-only migration 0009 to expand the database grant ceiling. Kept the
  project, rolling, queue and cooldown limits and consent/debit path in place.
- Extended the database upgrade and durable worker tests to cover an existing
  grant's preserved usage, the new ceiling and the exact rate-limit constants.
  The migration runner applied 0009 in development after isolated checks.
- Renewed the same grant and owner for 24 hours after confirming an empty
  live queue and three recorded dispatches. The 0600 private authorization
  was renewed for 23 hours and 59 minutes using the existing owner-confirmed
  Free Tier project, model and matching server key. Zero Gemini calls.
- Authorization, API/PostgreSQL integration and worker quota/concurrency,
  migration re-run, typecheck, frontend and security tests, both builds and
  package audit passed. Full secret audit still flags earlier approval metadata
  outside `main` history. The private origin and pushable history were verified.

## 2026-11-20 — Action Thread Stage 1 offline planning engine

- Added the `action-thread` contract, graph validator and pure structured-output
  request builder. Reused strict field, text and quote checks from extraction.
  The v3 contract separates suggested strategies from verbatim source data.
- Bounded graph size and retry traversals. Verified reachable acyclic forward
  paths, meaningful decision structures, and an exit for each retry.
- Added 38 offline cases in the API package, including Calc 2, portfolio,
  scheduling, simple and ambiguous requests, conditional evidence and invalid
  or injection-shaped output. Existing integration, worker, frontend/replay,
  typecheck, builds, security and package audit passed.
- Kept v3 outside the live request and persistence paths. Zero Gemini calls.
  Stage 2 requires separate authorization for live evaluation and persistence.

## 2026-11-20 — Action Thread Stage 2A persistence and API

- Added migration 0010 and owner-bound graph, progress and append-only
  transition storage. Split immutable proposals from versioned review,
  active-step state and retry accounting.
- Added authenticated Action Thread endpoints and integrated the v3 request
  and validator with shared extraction reservations, lease fencing and
  processing events. Live v3 gates close before authorization file access,
  debit or provider transport. Existing v1/v2 and task paths remain available.
- Verified persistence and restart, Calc 2 branches and exhausted retries,
  portfolio path convergence, concurrency, owner checks, provenance and
  injected storage rollback. Checked provider failure, timeout, cancellation
  and interruption in the v3 acceptance harness. No real Gemini calls.
- Passed migration upgrade/re-run, existing API and worker tests, 38 v3 unit
  cases, frontend/replay, workspace typecheck, both builds, security and audit
  regressions. Migration ran in disposable schemas only.

## 2026-11-20 — Action Thread Stage 2B graph and progress

- Matched Replit runtime database metadata and the development grant, applied
  migration 0010 through the existing runner and verified the ledger entry.
- Added the Capture Action Threads route, automatic 2D graph, responsive list,
  inspector and authenticated progress interactions. Reused the existing API
  client, icons, dark workspace tokens and CDP harness.
- Exposed the forward exit and optional retry together, using the existing
  row lock and event counts. Added PostgreSQL regression coverage for leaving
  without spending retry allowance and frontend tests for route projection.
- Verified the authenticated Chromium flow with disposable mock Calc 2,
  portfolio, clarification and rejection fixtures. Inspected graph and mobile
  screenshots. Capture, Action Plan, Tasks and How It Works regressions passed.
- Passed API, frontend, migration, typecheck, builds, security and package
  audit checks. No Gemini requests or deployment.

## 2026-11-21 — Action Thread Stage 3 offline implementation

- Verified development migration 0010, the expired singleton owner grant
  and protected provider approval, the three retained beta debits, and the
  existing key/model binding. Left authorization and billing untouched.
- Extended `extraction/gemini.ts`, `beta.ts`, `service.ts` and
  `routes/action-threads.ts` with the private v3 development scope,
  owner-only availability, atomic three-dispatch cap and safe output
  diagnostics. Preserved the strict v3 prompt and validator.
- Reused `CaptureEditor.tsx`, `ExtractionPanel.tsx`, `PlanProcessing.tsx`
  and `action-threads/ActionThreads.tsx` for consent, generation, recorded
  processing and the graph review link. Approval is an explicit user action.
- Extended the authorization and Action Thread integration tests plus
  the Capture and Action Thread Chromium harnesses. The offline adapter
  test verified one complete graph, zero graph rows for invalid and
  truncated responses, idempotency, cap rollback and grant isolation.
- Passed API and frontend tests, migration upgrade and replay, typecheck,
  both builds, Vite security, secret-audit regressions and package audit.
  Chromium passed v3 consent, queued/running/completed states, graph
  decisions, validation failure, quota denial and the earlier regressions.
  Zero actual Gemini requests. Live schema acceptance and quality depend
  on a newly authorized owner evaluation.

## 2026-11-21 — Stage 3 HTTP failure diagnostics

- Verified the first owner-submitted v3 run from sanitized logs and read-only
  PostgreSQL records. HTTP 5xx caused the extraction failure. The precise
  status was unavailable. The run debited one Stage 3 slot and one beta
  request. Verified active local authorization and two remaining slots.
- Updated `extraction/gemini.ts` to log the numeric failure status with the
  run ID. Kept the existing 400 diagnostic, quota handling and request shape.
- Extended `extraction/extraction.test.ts` with synthetic 429, 500 and 503
  responses to verify the exact log fields and unchanged error categories.
  Offline API and frontend tests, typecheck, both builds, security and audit
  checks passed. No new provider requests were issued.

## 2026-11-21 — Action Thread Depth Mode

- Added the opt-in Depth Mode toggle and shared perspective plane in
  `ActionThreads.tsx` and `ThreadGraph.tsx`. Preserved deterministic node
  positions and used frame-batched CSS updates for pointer tilt.
- Added active, connected, selected, and completed styling in
  `action-threads.css`, with static mobile and reduced-motion behavior.
  Rounded side-rail turns while retaining arrowheads and retry labels.
- Extended `thread-browser-check.mjs` to verify projected edge alignment,
  hover/focus, camera gestures, toggle behavior and touch at mobile width.
- Passed authenticated Chromium, frontend/API regressions, workspace
  typecheck and both builds. Inspected desktop and mobile captures. Zero
  Gemini requests and no runtime authorization changes.

### Default graph depth

- Removed the depth toggle, component state, and conditional CSS hooks.
  Graph now always has depth styling. List remains the narrow-screen default,
  and the existing motion preferences govern parallax and completion feedback.
- Updated the authenticated Chromium checks to assert the two view controls,
  perspective on desktop by default, and static depth on emulated mobile
  with reduced motion. No backend changes or Gemini requests.

### Bounded graph panning

- Updated `ThreadGraph.tsx` and `action-threads.css` to center axes that fit,
  constrain overflow, and expose pan controls and parallax only while the
  graph can move. Zoom and keyboard focus use the same camera bounds.
- Updated the browser checks for the stationary fitted graph, axis-specific
  pan, zoom-out, and zoomed touch gestures. No backend changes or Gemini
  requests.

### Kinetic Action Thread graph

- Extended ThreadGraph.tsx and action-threads.css with fixed SVG terminals and independently animated card faces. The layered faces keep the hit target and coordinates stable during lift and sway. Added graph-local motion settings and visibility handling.
- Passed the confirmed progress event from ActionThreads.tsx so a selected outcome or retry can animate after persistence. Updated thread-browser-check.mjs with timed idle samples, frame captures, preference, branch, retry and mobile checks.
- Workspace typecheck, frontend regression and security tests, both builds and offline PostgreSQL/API regressions passed. Updated RESULT.md and PROJECT_STATUS.md. No Gemini requests.
- The complete authenticated Chromium suite passed on desktop and emulated mobile. Multiple idle captures showed about 14 px of card travel with one fitted camera position across 10.2 seconds.

### Stage 4A — Observable execution failures

- Updated extraction claims, worker and lifecycle events to associate source failures and cancellations with the affected stage, distinguish terminal outcomes from retries, and record confirmed rollback, reconciliation and cooldown information.
- Added an owner-scoped, idempotent manual-plan choice to the extraction routes and expanded event types through migration 0011. How It Works resolves the pinned source revision and displays recorded recovery separately from available actions.
- Extended the authenticated Chromium harness with offline faults, exact source checks, graph rollback and choice replay. See RESULT.md for verification and remaining scope.

### Stage 4B — Public release candidate

- Added production-only AI policy, database consent/dispatch markers, and offline cohort, idempotency, quota and provider error checks. Preserved the development evaluation gates.
- Added HTTPS production OAuth with PKCE, bounded OAuth state issuance, static release hosting and readiness. Exercised a pre-0011 trace across upgrade and rerun.
- Added visitor replay using allowlisted synthetic trace exports, landing links and privacy/terms pages. Added launch, licensing and contributor documentation and removed an unused dependency.
- Verified locally with the built server and offline tests. Recorded external and publication blockers in RESULT.md and RELEASE.md. No live provider requests.
