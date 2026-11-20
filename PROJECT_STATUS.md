# Focus City project status

Last inspection: 2026-11-19 (UTC). See the Phase 5A section below for current verification and the next task.

## Version control and backup

GitHub destination: https://github.com/emreakg0/focus-city (private, owner emreakg0), connected as origin; existing gitsafe-backup retained. Existing history and recovery checkpoint 1a3834e are preserved. Source includes actual frontend/backend, SQL migrations, tests and memory documentation. Initial push succeeded on 2026-11-10: local commit b0fab19c19f4307dfc73d9f5a54df8b1fb2e2d9a matched GitHub refs/heads/main exactly. main tracks origin/main; privacy and clean working tree were confirmed. A follow-up documentation commit records this confirmation. Local Git uses GitHub CLI as its GitHub credential helper without embedding tokens in URLs or files in the repository.

Future completed, verified milestones must update memory, pass applicable checks and credential review, receive meaningful commits and push automatically to the private origin. Never force-push, delete the repository, change visibility or deploy without explicit permission. GITHUB_BACKUP.md documents recovery and verification. scripts/secret-audit.py scans all reachable history and tracked files; the initial audit found zero credential matches in 163 historical blobs. .gitignore additionally excludes OAuth downloads, token files, local GitHub/AWS/SSH configuration and data exports. Live database contents and runtime secrets are not backed up by Git.

## Overview and architecture

Private productivity workspace: Google sign-in, persisted projects/tasks and a miniature city derived from real tasks. React/TypeScript/Vite/Tailwind frontend lives in artifacts/productivity-app; Express backend in artifacts/api-server. PostgreSQL uses pg with namespaced SQL migrations in lib/db/migrations. OAuth state/session tokens are hashed in the database; browser cookies are HttpOnly, SameSite=Lax and Secure with HTTPS origin. API queries scope ownership to authenticated users; edits use optimistic versions.

App.tsx owns list/city switching, forms, filtering, search and API state. CityView loads CityScene lazily. layout.ts maps persistent slots to stable coordinates; composition.ts fits neighborhoods/camera; scenery.ts generates instanced props and four building archetypes. CityScene provides orbit controls, lighting, reflections, cached shadows, desktop bloom and context-loss fallback. Only the focused neighborhood renders. Slots expand into further blocks after 256 tasks.

## Recovered state

HEAD was 3f10439, preceded by 133c0f1 (starter commits). The entire Focus City implementation and overhaul were uncommitted when recovered. Existing edits include Replit configuration, backend/frontend, DB wiring and lockfile; untracked source includes city, API routes/tests, migrations and setup notes. None was discarded. README was stale starter documentation.

## Visual overhaul assessment

1. Adaptive framing: implemented; 0/1/5/20 desktop/mobile mathematical frustum tests pass. Independent Chromium checks and screenshots verified for 0/1/5/20 tasks.
2. Compact expandable neighborhoods: implemented with roads, curbs, crossings, trees, parks, fountain plazas, benches, lamps and cars. Deterministic scenery and stable layout tests pass.
3. Architecture: four silhouettes, facade details, windows, crowns, rooftop equipment/solar panels and construction details implemented. Real-task mapping tests pass.
4. Night/dusk lighting: warm windows, teal accents, hemisphere/key/fill lights, fog, stars, reflection environment, cached soft shadows and restrained desktop bloom implemented. Desktop/mobile screenshots inspected; lighting tuned to reduce washed-out surfaces.
5. Miniature aesthetic: implemented in source; independent desktop/mobile visual inspection completed.
6. Actual task/project integration: implemented; isolated two-account API integration tests pass. Google consent requires manual external verification.
7. Performance: instancing, memoization, demand rendering, bounded DPR, lazy loading and mobile bloom exclusion implemented. Physical-device frame rate/memory profiling incomplete. Large sparse multi-block neighborhoods may still frame too widely.
8. Camera scenarios: numerical tests pass; all four independent browser scenario reruns pass.

## Functionality and remaining requirements

Task create/read/update/delete, status/priority/deadline, search/filter, list/city navigation and selection exist. Projects support create/read only: rename/delete and task moves are missing. Database migrations and isolated two-account integration tests exist. Google redirect/state tests do not verify real consent.

The original Handshake challenge specification is absent from the inspected repository. From FOCUS_CITY_SETUP.md, remaining requirements are project rename/delete, task moves, generated OpenAPI contracts, stronger input/date validation, timezone settings, live OAuth/browser acceptance and deferred AI extraction, stored execution events, SSE and subway replay. This is a recovered list, not independently verified challenge completeness; obtain the original brief before claiming acceptance.

Known debt: health-only generated contracts; dense procedural code; large lazy 3D chunk (988.28 kB / 265.33 kB gzip); no physical GPU profiling; full OAuth consent not independently verified. Invalid dates can reach database errors. Do not change authentication/security as part of visual work.

## Active phase and next task

2026-11-10 Semgrep supply-chain milestone: all four named public configuration rules reproduced (4 baseline findings) and now pass (0 findings). Installed pnpm 10.26.1 is pinned; supported seven-day cooldown, blocked exotic subdependencies and no-downgrade trust are active, with blanket exclusions removed. npm 11.19.1 has a verified seven-day fallback but is not the project installer. Frozen CI-style install, typechecks, city/security/API tests and all production builds pass; dependency audit remains clean and lockfile/dependency versions are unchanged. Local registry fixtures verify actual rejection and exact-version urgent exceptions. SECURITY_AUDIT.md records rule revision, applicability/false-positive analysis, exception process and frozen-lockfile limitations. Next product task remains project rename API/UI and ownership tests.

2026-11-10 exposure review completed: repository is private with only its owner listed, no hooks/Pages; no credential matches found in tracked history or generated frontend assets. Patched dependency audit reports zero known vulnerabilities. Explicit Vite hosts, restricted file serving, API no-cache/security headers and fail-closed write-origin checks are implemented and regression-tested. See SECURITY_REVIEW.md for scope, tests and remaining production hardening; this does not certify the application free of all vulnerabilities. No deployment or GitHub access-setting changes.

Current visual milestone is verified. Camera framing now includes the floating platform underside, outer rim, empty-city lamps and tallest rooftop accents. Lighting is less washed out; parked cars now use both intended colors. The prior overhaul was substantially implemented before recovery; this session verified it and repaired these remaining details.

At the 2026-11-10 checkpoint, the next implementation task was to add project rename with ownership-scoped PATCH /api/projects/:id, validated names, sidebar editing and two-account integration coverage. Project deletion and task moves should follow with explicit data-preservation semantics. Before claiming final visual performance acceptance, profile a representative physical mobile device/laptop and test live Google consent with the registered account.

## Verification

2026-11-10: frontend layout/camera/scenery tests PASS; workspace typecheck PASS; frontend build PASS with chunk-size advisory; backend build PASS. API integration PASS (persistence, task CRUD, isolation, conflicts, OAuth redirect/state and logout). Chromium browser scenarios PASS for 0/1/5/20 tasks, including real building clicks when populated, task inspector/editor, neighborhood/view switching, 390px mobile overflow, context-loss fallback, empty state and no browser exceptions. Desktop overview and mobile screenshots inspected. Regression tests additionally verify platform/rooftop vertical extents and portrait-to-ultrawide frusta. No deployment authorized or performed.

Browser reproduction: existing frontend at http://127.0.0.1:21644 and API on 8080; launch Chromium with `chromium --headless --no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9222 --user-data-dir=/tmp/focus-city-recovery-chromium about:blank`, then run `CITY_TEST_COUNT=N node lib/db/scripts/city-browser.mjs` for N=0,1,5,20. This uses software rendering and isolated fixtures. Screenshots are ephemeral `/tmp/focus-city-N-overview.png` and `/tmp/focus-city-N-mobile.png`; regenerate in future sessions. No production authentication was bypassed or changed. Local checkpoint commit records recovered source plus verified refinements; see Git history for its ID.

## 2026-11-11 — Apple-design interface milestone

Implemented a city-centered workspace using the complete installed apple-design skill. The previous large summary cards and permanently exposed editor are replaced by inline progress, refined system typography, compact navigation, a larger responsive canvas, clearer task rows and an on-demand task sheet. Desktop building inspection floats beside the city; smaller screens keep it in document flow. Task editing uses a native dialog for focus containment, a reversible critically damped spring, symmetric desktop/mobile paths, mobile pointer capture/velocity projection and soft overscroll resistance. Added immediate press feedback, N-to-create, Escape dismissal, persisted save feedback and errors inside the editor. Reduced motion, reduced transparency and increased contrast receive explicit treatments. No backend/authentication/schema/dependency changes; existing task buildings, slots, completion illumination, camera gestures and List View fallback are preserved.

Verification: workspace typecheck PASS; frontend layout/camera/scenery tests PASS; frontend and API production builds PASS; isolated two-account API integration PASS. Chromium 0/1/5/20-task desktop/mobile scenarios PASS, including real building clicks, editor focus, neighborhood/view switching, WebGL context loss, no overflow/exceptions, keyboard task creation, actual API persistence/save feedback and reduced-motion Escape dismissal. An additional one-task touch regression verifies a short drag springs back without a synthetic dismissal click. Desktop overview screenshots for all four counts, selected inspector and mobile city/editor screenshots were inspected. Existing scene chunk advisory remains (988.28 kB / 265.33 kB gzip). No physical GPU or live Google consent claims.

Browser writes initially failed correctly against the hosted-origin API. Verification used a separate API at port 28081 with APP_ORIGIN=http://127.0.0.1:21646 and an ephemeral loopback proxy forwarding frontend assets from 21644. CITY_TEST_ORIGIN now configures the browser harness; production origin checks were not changed. All records created by the harness are isolated and cleaned in finally. DESIGN.md records the visual/interaction system. No deployment/publication performed.

Exact next unfinished design acceptance task: profile touch/keyboard interaction and rendering on a physical iPad/phone and laptop, including software keyboard resizing and GPU frame times. Existing product backlog remains project rename with ownership-scoped PATCH /api/projects/:id and integration tests, followed by explicitly specified project deletion/task moves. These existing missing operations were not simulated or added in this visual milestone.

## 2026-11-12 — Navigation, inspection and spring refinement

Continued the existing React interface after reading the full apple-design skill, project records and actual source/diff. Shared search/status controls now precede City and List View; filtered empty cities explain the filters and expose a clear action. Neighborhood navigation has aligned counts, current-location semantics and a compact horizontal mobile rail. Task inspection has stronger type hierarchy, neighborhood context, a consistent header close control, previous/next task browsing with boundaries/counts and Escape dismissal outside the editor. Mobile inspection uses symmetric vertical motion. Editor fields use 1rem text, its header stays available while scrolling, and the root type size follows the browser preference.

A shared exact critically damped spring now drives editor, inspector and view-selection motion. It preserves current position/velocity on retargeting and advances by elapsed time rather than a capped frame step, preventing slow settlement on low-frame-rate rendering. City/List selection uses independent position/width springs, observes control resizing and honors reduced motion. Reduced transparency and increased contrast cover the revised inspector/header materials. No dependency, API, authentication, schema or 3D scene changes. Pre-existing untracked skill files were preserved separately.

Verification: workspace typecheck PASS; frontend city/camera/scenery and new spring tests PASS; frontend/API production builds PASS; isolated two-account API integration PASS. Chromium 0/1/5/20-task desktop/mobile scenarios PASS, including inspector browsing, shared filters/reset, rapid view reversal, 20px-root editor overflow, touch spring-back, persistence/save feedback and reduced-motion dismissal. Desktop/mobile city screenshots for all four counts plus inspector/editor screenshots were visually inspected. Existing lazy-scene advisory remains 988.28 kB / 265.33 kB gzip. Software WebGL cannot establish physical GPU performance; live Google consent remains unverified. No deployment/publication.

Exact next unfinished design acceptance task: verify the horizontal navigation rail, inspector browsing, editor keyboard resizing and motion on a physical phone/tablet and laptop, including GPU frame times. Product backlog remains ownership-scoped project rename API/UI with integration coverage, then explicitly specified project deletion/task moves.

## 2026-11-16 — Threadline Phase 1 foundation

Approved pivot baseline is THREADLINE_ARCHITECTURE.md. This supersedes the older
project-rename next-task entries for current milestone ordering; that backlog remains.
Implemented additive 0003 storage for documents/source revisions, blocks/evidence,
collections/tags, relationships, runs/steps/events, and action/task links. Registered
in the existing migration runner. Existing authentication, tasks/projects, security,
city source and interface are unchanged. No dependencies added or installed.

Verification: isolated populated-schema upgrade and rerun PASS; all legacy fixture
rows unchanged; owner-consistent references, immutable source/events, idempotency,
evidence bounds, duplicate event sequence and task conversion tests PASS. Workspace
typecheck, frontend tests, frontend/API builds, API integration, frontend security
regressions PASS; pnpm audit reports no known vulnerabilities. Existing city chunk
advisory remains. Shared application schema was NOT migrated. No browser visual
verification this milestone; no UI changed. Live Google consent remains unverified.
Scoped schema/security review found no blocking issue; future API authorization,
evidence substring validation and job state transitions are not implemented.

RESULT.md contains the shareable completion report. No AI credentials/requests,
repository rename, deployment or publication. Phase 1 stops for review. Exact next
unfinished task AFTER approval: owner-scoped document/source APIs and persistent
capture; AI provider configuration requires separate authorization. Future API dev
startup runs the registered migration automatically; review before launching it.

## 2026-11-16 — Threadline Phase 2A: persistent document capture

Phase 1 approved; Phase 2A implemented only. Capture is accessible from the existing
Focus City sidebar and /#capture. Existing root City/List view, task/project features,
Google authentication, sessions and security controls remain. The existing 0003
additive migration was applied to the configured database; no new migration/schema
alteration was needed. API startup now requires the 0003 migration marker.

Authenticated owner-scoped APIs create/list/get/edit/archive/restore documents and
read immutable source revisions. Transactions and row locks protect expected-version
updates; conflicting saves return 409. Exact source text is retained; changed text
appends a revision. Stable client capture IDs make identical create retries safe.
Client response validation, manual/Ctrl/Cmd+Enter save, library/history, failure/draft
preservation, saved-version comparison and scoped dark/lavender UI are implemented.

Verification: workspace typecheck, frontend tests, frontend/API production builds,
existing API integration plus new isolated document integration PASS. New tests cover
restart persistence, ownership, invalid input including Unicode/body size, concurrent
conflicts, immutable sources, idempotency, archive/restore and injected revision-write
rollback. Foundation tests, frontend security tests and pnpm audit PASS (no known
vulnerabilities). Existing large lazy city chunk advisory remains.

Real Chromium capture browser suite PASS: desktop/mobile, lost-response retry without
duplicate, reload, original/history, real conflict preserving local draft, archive/
restore, reduced motion, no horizontal overflow and Focus City round trip. City
browser harness PASS for 0/1/5/20 fixtures, desktop/mobile; screenshots for all counts
and capture desktop/mobile inspected. All fixtures cleaned. Software WebGL does not
verify physical GPU performance; live Google consent remains unverified.

GEMINI_INTEGRATION.md records the selected future provider, structured/evidence
contract, limits, recovery and strict $0 gate. No key accessed/modified, Gemini calls,
AI dependencies/installs, billing changes, rename or deployment. Future integration
requires separately verifying actual free-tier project/model eligibility and approval.
RESULT.md is the shareable report; AGENTS.md now preserves that reporting requirement.
Exact next unfinished task: review Phase 2A. Do not begin Phase 2B until authorized.

## Phase 2B — Gemini extraction foundation, live DISABLED

Implemented pinned-source extraction route, modular server adapter, strict independent
JSON/evidence validator, atomic needs_review block/evidence writes and minimal real
run/step/event persistence. Capture has Organize with AI and read-only results; live
calls are hard disabled before secret access. No mock result is shown as Gemini.
Selected gemini-2.5-flash-lite standard text generateContent based on official public
pricing; owner project billing/free-feature eligibility and first-call permission are
NOT confirmed. No provider request, key read/change, dependency install, deployment,
repository rename, task mutation or city removal occurred.

Verification: focused mock/database tests PASS for JSON/kind/unknown-key rejection,
exact evidence/emoji offsets, deadline uncertainty, source ownership, idempotency,
needs_review, failure/quota/model/auth/timeout handling, transient retry and failed
block-save rollback. Existing API/document tests, typecheck, frontend tests/build,
API build, security tests and audit PASS. Capture browser regression PASS including
explicit LIVE_DISABLED action, existing editing/history/conflict/archive/navigation.
No live free-tier inference or HTTP provider behavior verified; no physical GPU/live
OAuth verification. Existing city chunk advisory remains. No city-specific change.

Next unfinished task: review Phase 2B and separately confirm project Free Tier without
paid billing, exact selected model/features and authorize a first non-sensitive test
call. Do not begin Phase 2C leases/recovery or Phase 3 replay automatically. Full
limitations and source contracts are in GEMINI_INTEGRATION.md and RESULT.md.

## Phase 2C — durable processing and recorded history

Implemented queued 202 creation with pinned immutable source/idempotency, bounded
DB-backed claims and token leases/heartbeats, fenced saves, truthful stage/events,
atomic needs_review blocks/evidence/completion, and startup/periodic expiry recovery.
Unknown provider outcomes become interrupted without automatic resend. One known
transient retry only; creation and dispatch-day quotas and project 429 pause preserved.
Owned cancellation and paginated history/steps/events are implemented. Capture polls
persisted state, can refresh/cancel, and explicitly says Gemini remains disabled.
Existing schema reused except additive compatibility migration 0004 (unstarted
terminal timing). No install, paid service, billing/settings/secret
change, repository rename, deployment, Phase 3 UI or city removal.

Verification: targeted durable DB/mock suite PASS, including actual child SIGKILL in
provider wait and blocked persistence, racing claims/enqueues/events, lease expiry,
idempotent reconciliation, stale/cancelled result fencing, transient retry/exhaustion,
12s hung-adapter timeout, project pause and rollback after a second block insert fails.
Phase 2B validator/mock tests and existing auth/document/API regressions PASS; owned
history/events survive HTTP server restart and foreign run/step/event reads fail.
Workspace typecheck, frontend tests/build, API build, foundation/security tests/audit
PASS. Capture desktop/mobile browser suite PASS, including async LIVE_DISABLED state
and existing persistence/conflict/history/archive/City round trip. Screenshot inspected.
No city-specific rendering changes; no physical GPU/live Google consent verification.
Existing city chunk advisory remains. Full 0/1/5/20 browser counts were not rerun here;
city mathematical/scenery/spring regression suite passed.

Live Gemini remains DISABLED / UNVERIFIED; no provider requests or key access. Exact
next unfinished task: owner review of Phase 2C. No Phase 3 or real inference until
separately authorized. See RESULT.md for commands, source changes and limitations.

0004 was applied after isolated upgrade/rerun checks; local API restarted for the
new readiness marker. No source/task/history rewrite or deployment.

## Phase 3 — actual execution diagram and deterministic replay

Implemented How It Works from Capture (#capture/runs and #capture/run/<id>), owned
history pagination, stage nodes, event/step inspector and deterministic read-only
Play/Pause/Restart/back/forward/rate/seek controls. Trace reader validates and paginates
all events/steps, deduplicates safely, warns on gaps/unknown observations and never
fabricates missing stages. Recovery stays interrupted; LIVE_DISABLED stays failed.
Reduced motion retains manual controls. Capture drafts survive view navigation.
No backend lifecycle/schema/inference changes; LIVE_AUTHORIZED=false unchanged.

Verification: replay model tests, typecheck, frontend tests/build, API build, API
integration/durable tests, foundation and security tests PASS; pnpm audit reports no
known vulnerabilities. Full API command initially exited SIGTERM after its passes;
isolating the durable crash test with node --import tsx exited 0, and changing only
that script entry made the full command exit 0. No dependency changes/install.
Browser suite passes real persisted mock success/retry/interruption/recovery/cancel,
forced small pages, identical reloaded IDs/sequences/status/timings, owner isolation,
network failure, play/pause/seek/back/forward/speed, keyboard/touch/reduced-motion and
Capture/City navigation. Replay created zero new runs. Desktop/mobile images inspected;
corrected inherited mobile inspector layout and a test reload timing race. Initial
test-server crash fixture schema was positively identified/removed; no user data removed.

No city-specific changes; city/scenery/camera/spring regressions pass; full 0/1/5/20
city browser counts not repeated. Existing city chunk advisory persists. Live Gemini,
Google consent, physical-device behavior and published Replit acceptance unverified.
No credential access, paid inference, billing, install, deployment, rename or Phase 4/5.
Exact next unfinished task: owner review of Phase 3. Do not start further phases or
live inference automatically. RESULT.md holds the shareable completion report.

## 2026-11-18 — Threadline Phase 4 knowledge workspace

Implemented the workspace shell, keyboard palette, document search and
organization, and persisted versioned block review with immutable source
evidence. How It Works still reads recorded execution data. Threadline is
available from Focus City and by hash link. Focus City remains the default
entry pending design acceptance.

Workspace typecheck, frontend unit/security tests, frontend/API builds, all
API integrations, isolated migrations and package audit passed. Chromium
passed capture, organization, review, draft preservation, real conflicts,
focus recovery, mobile touch/overflow, reduced motion, explicit mock replay
and LIVE_DISABLED paths, owner isolation and the Focus City/List View round
trip. Focus City also passed browser scenarios with 0, 1, 5 and 20 tasks.
Desktop and mobile screenshots were examined. See RESULT.md for the
full verification record and limitations.

Exact next unfinished task: owner review of Phase 4 to decide whether
Threadline should become the authenticated default. Keep Gemini disabled and
stop at Phase 4.

## 2026-11-19 — Threadline Phase 4.1 refinement

Refined Capture, palette, Knowledge, Collections, Review, and the shared shell.
The last browse view retains its selection and filters when opening a document.
Review separates edited text and original evidence and keeps conflict recovery
beside edits. The frontend uses the existing data and replay contracts.

Workspace typecheck, frontend/API builds, app/security tests, isolated API
suites, package audit, and the expanded Chromium harness passed. Baseline and
final captures were inspected at desktop, tablet, and mobile widths. Narrow
touch navigation, focus, and reduced motion passed. RESULT.md records
limitations and the visual evidence. Live Gemini is disabled.

The next unfinished task is owner design acceptance of Phase 4.1 and a decision
on the authenticated default entry. Stop at Phase 4.1.

## 2026-11-19 — Threadline Phase 5A Action Planning

Action Planning takes precedence over the previously planned knowledge graph.
Backlinks, the graph, and relationship visualization stay deferred.

Brain Dump links to a persistent per-document Action Plan. Manual editing,
explicit scheduling and approval, and transactional conversion now use the
existing knowledge blocks, task system, and unique conversion links. Schema
v2 permits draft paraphrases with exact evidence while schema v1 and its
recorded history retain their contracts. LIVE_AUTHORIZED=false.

Typechecks, frontend tests, API suites, builds, migration and security checks,
package audit, and Chromium passed. Chromium verified manual planning, a
mock v2 plan from the sample dump, calendar confirmation, two linked tasks,
progress persistence, conflicts, and another owner's denial. Focus City
passed its 0, 1, 5, and 20 task browser cases. See RESULT.md for screenshots,
coverage, and remaining limitations. Migration 0006 was tested in disposable
schemas and is required before starting the updated API.

The exact next task is owner review of Phase 5A. Live inference requires
separate Free Tier verification and explicit first-call authorization.

## Threadline standalone transition

Threadline is the default at `/`. The existing Google OAuth callback
redirects there, and Tasks now lives in the workspace and command palette.
Task creation, editing, completion, project filters, and Action Plan links
use the existing owner-scoped API. Older task links resolve to Tasks as well.

Chromium verified root entry, mobile task workflows, and Action Plan links
in isolated schemas. The existing task and authentication integrations,
workspace checks, builds, and security checks passed. Live Google consent
was outside this verification. The private origin is `emreakg0/threadline`.

The next task is owner review of the standalone transition. Legacy City
source and dependency removal require a separate cleanup milestone.
LIVE_AUTHORIZED=false.

## Threadline Phase 5B — Gemini 3.5 Flash-Lite

The Gemini Developer API adapter now pins `gemini-3.5-flash-lite` and planning
schema v2. Durable PostgreSQL scheduling enforces shared project capacity,
owner ceilings, Pacific daily reset, revision deduplication, and a provider
429 cooldown. Brain Dump surfaces availability and Free Tier data-use terms.
A resumable processing page reads the run's actual recorded stages.

Isolated API, database and Chromium checks exercised scheduling, recoveries,
mock planning, review, task conversion, and legacy replay. The checked-in
`LIVE_AUTHORIZED=false` gate remains closed. Migration 0007 was exercised only
in disposable schemas. The next task is an explicit owner decision on one
synthetic first call. Project/key access and actual structured response quality
still require that separate bounded verification.

## Threadline Phase 5B.1 — pilot preflight blocked

The owner authorized one synthetic `gemini-3.5-flash-lite` request. Preflight
verified the pinned endpoint and server-side key presence. This environment
could not verify project billing or the configured key's project association.
Zero requests were sent, and the application gate stayed closed. Focused
isolated integration checks verified the normal API's `LIVE_DISABLED`
response.

The next task is to confirm current Free Tier and billing status for
`threadline-gemini`, and the existing key's association with it, before
preparing the one-shot pilot. Live output and its downstream processing
remain unverified.

## Threadline Phase 5B.1 — pilot completed with provider rejection

After owner verification of the Free Tier project and key association, the
isolated worker consumed its single allowance and sent one
`gemini-3.5-flash-lite` request. Google returned HTTP 400
(`PROVIDER_REJECTED`). Source validation passed. No output was available
to validate or persist, and the authenticated replay events showed the
failed extract stage. No actions or tasks were persisted.

The pilot allowance was revoked and its disposable schema removed. The
normal API verified both gates remain closed. The next step before any
general availability decision is to diagnose the provider rejection.
Any further live request requires fresh owner authorization.

## Phase 5B.2 — Offline HTTP 400 investigation

Offline verification passed for the revised Gemini request schema, safe HTTP 400 diagnostics, Action Plan persistence and historical replay. The original rejection remains unexplained. Live inference is closed. The next unresolved question is whether Google accepts the revised request under this project; checking that requires separate owner authorization.

## Phase 5B.3 — Second authorized pilot

The revised request received HTTP 200 in the second authorized pilot. Four expected action topics appeared. Local exact-evidence validation failed, so no proposals, dates or tasks were saved. The next open issue is reliable source evidence grounding. General inference is closed and further live requests require fresh authorization.

## Phase 5B.4 — Reliable source evidence grounding

The isolated Chromium workflow saved four mock actions from the exact pilot brain dump with server-grounded evidence. Invalid evidence rejected the entire plan. Historical v1/v2 replay, security checks and integration tests passed. The remaining question is whether Gemini reliably returns unique verbatim quotes under the new prompt. Any live evaluation requires separate authorization.

## Phase 5B.5 — Third authorized live pilot

Verified one live end-to-end run through PostgreSQL persistence and authenticated Action Plan review. All four expected topics had unique exact source evidence. Eleven events recorded the completed run. The two deadline-bearing actions remained unresolved and no tasks were created. The remaining open question is consistent semantic fidelity, including tentative wording. Stop for owner review; no live requests remain authorized.

## Phase 5C — Controlled personal beta readiness

Owner-only admission, bounded database grants, revocation, per-revision consent and dispatch accounting are implemented and mock-tested. The ordinary gates remain closed and no live requests were sent. Proposed first window: three requests total in 24 hours for one verified account. The next decision belongs to the owner: approve or decline an exact account, allowance and validity window after reviewing Free Tier privacy and interpretation risks.

## Phase 5C.1 — Development owner beta activated

Existing migration 0008 is applied to development. Following the owner's account
and Free Tier/key-association confirmation, one owner-only grant allows three
total dispatches until 2026-11-20 07:12:43.255 UTC. Verification found zero used,
three remaining, and both runtime gates open. No Gemini requests, billing changes,
deployment or automatic retries were performed. Approval is development-scoped,
key/project/model-bound and expires automatically; production remains disabled.
Gate, API/worker, typecheck, frontend, security, build and dependency checks passed.
See RESULT.md for evidence and immediate revocation instructions.
Next unfinished task: owner-initiated use and evidence review within this allowance;
any extension requires fresh authorization.

## Security cleanup — Private owner-beta configuration

Removed approval and activation values from tracked `.replit`, preserving the
existing approval in a 0600, Git-ignored/deployment-excluded private runtime file.
Verified private-file gate access and the original owner/model/expiry/budget:
one used and two remaining at verification, with no request sent by cleanup.
Expanded audit and gate regressions passed; API integration/worker, workspace
typecheck, frontend/security, both builds and dependency audit passed.
No raw-credential matches were found in scanned history or available retained
logs. The default audit still rejects the historical approval/fingerprint in
`.replit`; no rewriting or allowlisting was performed. Current files are clean.
Next unfinished task: restore GitHub access, verify the private origin and
review the historical audit finding before completing the remote backup.

## 2026-11-19 — Development owner beta budget renewal

Migration 0009 is applied in development. The existing owner grant now has a
100-request ceiling and a new 24-hour window ending 2026-11-20 23:38:35.931 UTC.
It retained the owner binding and three used dispatches, leaving 97 at
verification. The renewed Free Tier authorization in the approved 0600
runtime file is valid for 23 hours and 59 minutes. The project uses the
owner's previously verified Free Tier status and the locally verified key/model
binding. Setup and verification submitted zero Gemini requests.

Migration replay, API authorization/quota/concurrency, PostgreSQL integration,
typecheck, frontend/security, both builds and package audit passed. GitHub
privacy verification is available again. The pre-existing audit finding is
outside the history reachable from `main`; current/staged files and reachable
`main` history were checked for the private push. See RESULT.md.

Next unfinished task is owner-initiated testing and review of persisted
evidence within the renewed window. Action Thread redesign remains deferred.

## 2026-11-20 — Action Thread Stage 1

The backend-only v3 contract, prompt and offline validator are implemented.
Synthetic tests verified actionable plans, meaningful branching, path
reachability, bounded retries, clarification and exact source provenance. The
v1/v2 request and execution paths remain in use. API/PostgreSQL, frontend,
typecheck, builds and security checks passed. No Gemini requests, beta changes,
schema migrations, UI changes or deployment were performed.

Next unfinished task is separately authorized Stage 2 evaluation of the v3
structured response on synthetic inputs, followed by versioned persistence
and replay design. Gemini acceptance and planning quality remain unverified.

## 2026-11-20 — Action Thread Stage 2A

Version 3 now has owner-scoped PostgreSQL graph storage, authenticated review
and progress APIs, and integration with the existing leased worker and
processing trace. The proposal is immutable. Progress has its own version and
transition history, including cumulative retry accounting. Live v3 admission
and dispatch are closed.

Verified 38 graph cases and an offline end-to-end test in a disposable
PostgreSQL schema. Migration upgrade/re-run preserved v1/v2 history. API,
typecheck, frontend/replay, builds and security checks passed. No provider
requests, task creation during the v3 smoke test, or deployment.

Next unfinished task is the owner's Stage 2B decision. Before any live
evaluation, apply migration 0010 to the intended environment and obtain a
separate bounded v3 authorization. See RESULT.md for the API and evidence.

## 2026-11-20 — Action Thread Stage 2B

Capture now includes the interactive Action Threads graph and responsive
list. Persisted branches, progress controls, source evidence and history work
through authenticated v3 APIs. Retrying is optional and its limits remain
cumulative. Migration 0010 was applied through the runner to the verified
Replit development database.

Authenticated disposable PostgreSQL and Chromium tests passed, including
both Calc 2 outcomes, voluntary exit, converging paths, conflict recovery,
owner isolation, mobile, keyboard and reduced motion. Desktop and mobile
screenshots were inspected. Existing Capture, Action Plan, Tasks and replay
regressions, typecheck, builds and security checks passed. Live v3 generation
remains disabled and the development database contains no test graphs.

Next unfinished task is the owner's decision on further scope. Any live v3
evaluation requires separate authorization. No next stage was started.
