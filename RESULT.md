# Threadline Phase 5B — Gemini 3.5 Flash-Lite

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
