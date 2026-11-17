# Threadline Phase 3 — How It Works and recorded replay

Implemented Phase 3 only. Open **How It Works** in Capture, or inspect the linked run
from its extraction panel. Run links use `/#capture/run/<owned run UUID>`; history is
`/#capture/runs`. Existing Capture drafts and Focus City remain available.

## Shipped

- Owned run history with older-page loading and linkable run selection.
- Connected source/validate/extract/evidence/persist nodes with actual recorded state,
  attempts and safe details. Legacy stage keys remain inspectable. Missing observations
  show not observed. Recovery is distinct from success; LIVE_DISABLED stays failed.
- Read-only event/step inspector with IDs, sequence, observed time, actual start/end,
  wall duration, safe summaries, errors/recovery and explicit mock provenance. No raw
  source, extracted blocks, arbitrary payload JSON or lease tokens rendered here.
- Play/Pause, Restart, backward/forward, range seek and 0.5x/1x/2x playback. Deterministic
  sequence order; intervals clamp to 0.3–1.8s at replay 1x. Actual observed span and step
  wall times are separate. Playback never starts extraction or creates a run.
- Keyboard controls, native touch controls, focus management, status announcements,
  text state labels and reduced motion (manual steps/log/seek, no autoplay).
- Complete paginated trace reads, safe deduplication, conflict/cursor checks, gap and
  unknown-status warnings, loading/empty/access/error states. An unread/failed page
  does not become partial successful playback. Active run refresh is bounded.

## Files

New frontend trace.ts validates/projects API records, replay.ts supplies deterministic
state/timing, HowItWorks.tsx handles history/loading, ExecutionReplay.tsx renders nodes
and controls, TraceInspector.tsx renders metadata, execution.css scopes the layout.
These responsibilities did not exist in the capture/editor components. New replay.test.ts
is part of the frontend test command. App/CaptureWorkspace/ExtractionPanel add limited
navigation; Capture remains mounted while inspecting a run so unsaved text is preserved.

The existing isolated capture browser harness now calls replay-browser-check.mjs,
which creates real persisted mock traces through existing queue/worker/recovery/cancel
services and checks read-only playback. API package test script uses node --import tsx
only for the existing crash test to avoid CLI SIGTERM supervision; no new package.
Architecture, Gemini contract, design, status and development log updated.

No backend API contract, worker lifecycle, schema, auth, city rendering, source/evidence
rules, quota or Gemini gate was changed. No Phase 4/5, graph or broader redesign.

## Evidence and checks

Passed:

- Replay tests: serialization/reload identity, paginated out-of-order/deduplicated reads,
  conflicting IDs/sequences, invalid cursors, missing events, foreign step references,
  deterministic timing/seek/rate, retry, interruption/recovery and cancellation.
- `pnpm --filter @workspace/productivity-app test`
- `pnpm typecheck`
- Frontend and API production builds
- `pnpm --filter @workspace/api-server test` — clean exit 0 after runner correction
- `pnpm --filter @workspace/db test:foundation`
- `pnpm --filter @workspace/productivity-app test:security`
- `pnpm audit` — no known vulnerabilities
- Isolated Chromium capture/replay browser harness: normal saved LIVE_DISABLED failure,
  real mock success/retry/interruption/recovery/cancellation, history and all-event page
  loading, full serialized trace equality after reload, controls/pause/seek/both steps/
  rate change, keyboard, touch, reduced motion, API failure and owner A/B rejection.

Proof of persistence: displayed event IDs are compared with PostgreSQL IDs in sequence
order. Browser serializes the complete validated run/steps/events and reloads the app;
IDs, sequences, statuses and timings remain identical. A test-only small-page response
wrapper forces pagination of those unaltered stored rows. Total run count before/after
replay stays unchanged. Mock labels remain visible; no Gemini success is fabricated.

Desktop and mobile replay screenshots examined, including reduced motion and vertical
mobile nodes/inspector. Ephemeral images:
`/tmp/threadline-2a-replay-desktop.png`, `/tmp/threadline-2a-replay-mobile.png`.
Reproduce: frontend on 21646 and Chromium CDP on 9222, then
`pnpm --filter @workspace/api-server exec tsx ../../lib/db/scripts/capture-browser.mjs`.
The harness owns a temporary schema and loopback server on 28126; fixtures are cleaned.

Initial issues: inherited mobile aside layout fixed; a reload assertion race corrected
by waiting for a new document and full event count. A test-only response wrapper crashed
before Express attached res.json; corrected and its verified orphan fixture schema
removed. API command initially returned SIGTERM despite pass output; the same crash
test passed with Node's tsx loader, and the minimal test-command change yields exit 0.

## Limits and boundary

Existing lazy city bundle warning remains. City/camera/scenery/spring tests and City
navigation pass; full 0/1/5/20 city browser scenarios were not repeated because city
source did not change. Physical hardware, live Google consent, published Replit and
real Gemini responses remain unverified. No paid/free inference or credential access;
LIVE_AUTHORIZED=false is unchanged. No install, billing change, paid fallback, deployment,
repository rename or visibility change. Successful mock traces exist only in isolated
test schemas, never inserted into production as Gemini runs.

Playback uses known recorded observations, not hidden model reasoning or fabricated
stages. Historical metadata can be incomplete; warnings and final stored step details
remain separate from replay-at-cursor state. Trace reads cap at 2000 pages/collection;
history remains manually paginated and is not a cross-request snapshot. Active reads
refresh at most 30 times; use Refresh records after that. Exact evidence matching still
does not establish semantic truth. No physical performance or screen-reader user study
is claimed; native semantics/announcements and automated interaction are verified.

Next unfinished task: owner review of Phase 3, including the real LIVE_DISABLED trace.
Any later phase or first inference call needs separate authorization; no automatic
progression. The live call gate still requires manually confirmed project Free Tier/no
paid billing, exact eligible model/features, current quotas and first-call approval.

Final scoped correctness/security review covered read-only requests, owner-scoped APIs,
page/cursor validation, replay state projection, safe text rendering and interaction
coverage. No remaining blocking finding identified. Verified milestone is committed
and pushed to the existing private origin under `Add recorded execution diagram and
read-only replay` after staged review, secret audit and private-repository checks.
No subsequent phase is started.
