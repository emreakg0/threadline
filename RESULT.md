# Threadline Phase 5B.4 — Server-grounded source evidence

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
