# Threadline Phase 5B — Gemini 3.5 Flash-Lite

Phase 5B is ready for a separately authorized, one-request pilot. The checked-in
gate remains `LIVE_AUTHORIZED=false`. The key was never read or changed, and no
provider requests, billing changes, or deployment took place.

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

## Pending owner authorization

Apply migration `0007_threadline_gemini_quota` before starting the updated API.
Google documents structured output and free standard text for this model on
eligible Free Tier projects. The project tier and limits are owner-reported.
Actual access through the configured key, acceptance of the exact request,
and generated-plan quality remain unverified. Threadline cannot see external
use of the Google project or validate its billing tier from the text API.
See [GEMINI_INTEGRATION.md](GEMINI_INTEGRATION.md) for the single-revision
pilot boundary. Stop for explicit authorization of that one synthetic test.
