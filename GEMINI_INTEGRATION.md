# Phase 2B contract — Gemini, strictly $0

Documentation only. Phase 2A contains no Gemini client, requests, credential reads,
AI dependencies, processing runs or execution animation. GEMINI_API_KEY will be
server-only in Replit Secrets; never print it, put it in VITE_* variables, return it
through an API, or put it in a URL/log. Provider integration needs separate approval.

## Free-tier gate

The owner requires genuinely free inference, not credits, a trial allowance masking
paid inference, or a budget alert. Do not enable/link billing, prepay, add payment
methods, upgrade tiers, or fall back to another model/provider. Before enabling any
request, verify the selected key's project is on the actual Free tier with no linked
paid billing and verify that the exact model/endpoint/features have free-tier support.
Do not infer that from a key name, environment flag, or an advertised model price.
The application alone cannot prove Google account billing state from a secret value.
If eligibility cannot be verified, remain disabled. If free access disappears, stop.

Google documents a Free tier for certain models and paid access through billing setup:
[Billing](https://aistudio.google.com/docs/billing). Select and pin a model only at
Phase 2B approval after rechecking [pricing](https://ai.google.dev/gemini-api/docs/pricing)
and project eligibility. No model name or quota is assumed here. Free-service data-use
terms must be reviewed before sending private notes; explain them in the consent flow.
No web grounding, file uploads, search tools, paid caching, embeddings or Vertex fallback.

## Request and validated result

A server-owned run pins source_revision_id, owner and pipeline/schema/prompt/model
versions. Source text is untrusted data, not instructions. Send only that revision;
no browsing, tools, credential context, unrelated documents or cross-owner retrieval.
Use Gemini structured JSON output with a supported JSON Schema subset. Provider schema
conformance never replaces local runtime validation or factual evidence checks.
Google reference: [Structured output](https://aistudio.google.com/docs/structured-output).

Proposed version 1 result, for the example source `Please confirm the launch date.`:

```json
{
  "schema_version": 1,
  "blocks": [
    {
      "kind": "action",
      "content": "Confirm the launch date",
      "evidence": [{"quote": "confirm the launch date", "start": 7, "end": 30}],
      "uncertainty_reason": null,
      "deadline": null
    }
  ],
  "open_questions": []
}
```

The example is contract syntax, not an executed result.
Validate exact keys, enum kinds, bounded counts/text, nullable fields and evidence.
Use zero-based half-open Unicode code-point offsets; convert explicitly at the JS
boundary. Each evidence quote must match the pinned source exactly. Reject offsets
outside the source, unsupported factual blocks, invalid dates, malformed JSON,
truncation and unsupported schema versions. Do not silently repair invented facts.
Summaries use the ordinary summary block kind and the same evidence requirements;
there is no parallel ungrounded summary artifact. Bound results to at most 24 blocks
and 1,200 characters per block, with an initial maximum output budget of 4,096 tokens;
if insufficient, show a truncation/validation failure rather than silently accepting
partial JSON. Recheck these ceilings against the chosen free model before enablement.

Do not invent assignees, dates or decisions. Unresolved values are null with an
uncertainty reason or explicit open question. Relative dates require known capture
context/timezone and user confirmation. All generated blocks initially need review;
task creation remains a separate explicit idempotent user action.

## Limits, failures and recorded execution

Apply owner and shared-project request/token quotas before calling the provider;
provider quotas are project-wide, not key-wide. Read active limits at integration
approval rather than hardcoding an assumed public free allowance. Bound input,
output tokens, concurrency and daily requests conservatively. Do not split notes
into unlimited calls or retry forever. Reference: [Rate limits](https://aistudio.google.com/docs/rate-limits).

Use a request timeout and at most one bounded transient retry with jitter; respect
Retry-After and persist attempt count. A 429/quota response pauses further calls and
shows retry eligibility; exhausted free quota never upgrades billing. Authentication,
permission, safety rejection, unsupported-model and validation failures stop with a
safe explanation and preserve the source. No synthetic successful output fallback.

Persist real validate/extract/evidence/persist step starts, completions, durations,
errors and recovery actions. Commit output/completion atomically; retries and expired
leases produce actual events. No event claims a provider call occurred unless it did.
A failed storage write cannot promise a durable failure event until storage recovers.
Reconcile uncertain work through run IDs/idempotency and leases. UI replay consumes
only recorded events. Integration acceptance includes mocked failure tests and a
separately authorized real free-tier run; Phase 2A does neither provider operation.

## Implemented Phase 2B (live DISABLED / UNVERIFIED)

Selected exact model: gemini-2.5-flash-lite, standard text-only generateContent:
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent.
Official pricing inspected 2026-11-16 lists standard text input/output free of charge:
https://aistudio.google.com/docs/pricing#gemini-2.5-flash-lite . Batch/cache/grounding
are not used. Endpoint reference: https://aistudio.google.com/api-reference/generate-content .
Structured output and project-wide quota references remain linked above. Public
pricing eligibility is not project verification. Owner has NOT confirmed project
Free Tier/no paid billing, exact features or first test call. No provider requests
occurred. LIVE_AUTHORIZED=false in the server adapter blocks before secret access;
no environment switch or browser input bypasses it. Reverify model availability,
pricing and actual project quotas before a separately approved code-gate change.

Implemented schema supersedes the illustrative earlier proposal: exact keys
schema_version:1 and blocks (0–24). Blocks have kind, content, uncertainty_reason
(null or text), evidence (1–8 exact quote/start/end spans). No deadline date field
or top-level open_questions; questions use question blocks. Content must equal one
of its evidence quotes: extractive summaries only, no unverifiable paraphrases.
Every deadline requires an uncertainty reason; no relative date resolution. Stored
spans count Unicode code points via Array.from(source), not UTF-16 indices. Model
classification and source truth still need human review; quote matching is not a
semantic fact checker. All persisted output is needs_review; no task creation.

Native server fetch, pinned endpoint/model, no SDK/dependency added, 12s timeout,
4096 output tokens. At most one jittered retry (500–1000ms) on 5xx transient status;
429/auth/model/safety/validation failures do not retry. One database advisory session
lock bounds concurrent work across API processes. Durable app quotas reserve two
attempts/run: 10 runs/project and 3/user per UTC day. These are conservative app
ceilings, NOT confirmed Google quotas; per-project external use is outside this app's
accounting. A recorded 429 pauses this app for 24h. Active project limits must still
be verified before enablement. No paid fallback or automatic upgrade.

POST /api/extractions accepts saved source_revision_id and idempotency_key behind
existing session/origin checks. GET /api/extractions/:id returns owned run/results.
Requests execute synchronously; retries with the same key retrieve recorded state.
Minimal truthful extract_validate steps/events include retry and failure metadata;
blocks/evidence/completion commit atomically. Mock adapters are injected only by
server tests, recorded as provider=mock. Production never substitutes mock output.

Phase 2C gaps: robust leases, restart recovery, complete stage lifecycle and history
navigation. A process kill can leave a running record; do not replay/recover it as a
success. A continuing DB outage may prevent recording failure. No replay diagram.
Provider HTTP response handling and real free-tier inference remain unverified.

## Phase 2C — durable execution; live gate unchanged

LIVE_AUTHORIZED remains false. No GEMINI_API_KEY access or inference requests during
this milestone. Model/endpoint remain the Phase 2B selection; their present project
eligibility and owner first-call approval remain unverified. Worker checks the closed
gate before calling the adapter; queued requests end honestly with LIVE_DISABLED.
Mock adapters are injected only in isolated test workers, with provider=mock recorded.

Processing now queues before work, releases database connections during provider wait,
uses 30s token leases/5s heartbeats/12s abortable provider waits, and commits output and
success atomically. Only a known transient failure receives one scheduled retry; 429
pauses project work for 24h. Source/schema/evidence checks and needs_review are unchanged.
Quota checks cover both creation-day reservations and actual dispatch-day attempts.
No infinite resend loop or paid fallback. Cancellation discards late output and
cannot undo provider processing. Expired leases end interrupted with recovery events;
uncertain remote outcomes are deliberately not retried automatically.

Phase 2C adds bounded owned run/step/event read APIs, not a replay diagram. Recovery
is proven with killed mock child processes during provider wait and a blocked write,
plus concurrent claims/event allocation and stale-result rejection. No Gemini HTTP
or billing test is claimed. A future authorized live test still requires manually
confirmed genuinely Free Tier/no linked paid billing, exact eligible model/features
and quotas, plus separate first-call authorization. Phase 3 remains unapproved.

## Phase 3 — replay is not inference

LIVE_AUTHORIZED=false remains untouched. How It Works only reads existing run,
step and event APIs; playback, seek, rates and restart never create runs or request
provider output. The inspector does not render raw source/blocks/credentials. Mock
runs are plainly labeled MOCK ADAPTER — NOT GEMINI. A LIVE_DISABLED failure is shown
as a failed trace with later stages not observed. Recovery decisions are not success.

Successful/retried/interrupted/cancelled replay validation uses isolated non-sensitive
fixtures and actual persisted records produced by existing mock worker/recovery
services. No actual Gemini calls, key reads/changes, free-tier verification or billing
changes. Any future first inference call still requires the separate owner gate.

## Phase 4 — human review

Review reads stored extraction blocks through the document owner scope.
Confirm, dismiss and edit are versioned writes on the block. They preserve
the originating run, source revision, exact excerpt and original extraction
uncertainty. A user edit is identified separately from extraction provenance.
Mock blocks retain the mock label. How It Works continues to read recorded
events and replay them without starting processing. LIVE_AUTHORIZED=false.

## Phase 5A — grounded plan schema v2, live disabled

Action Planning requests pin schema version 2, pipeline `plan-1`, and prompt
`grounded-plan-1`. Legacy runs keep schema 1, `2c-1`, and `extractive-1`.
Worker dispatch validates the matching tuple and uses the corresponding
response contract. Existing recorded stage keys retain their meaning. The
recorded run identifies schema v2 in How It Works.

Version 2 permits a concise draft summary and action titles, with the same
exact source evidence requirements and Unicode code-point offsets. An action
may suggest context, category and priority. A deadline phrase must be copied
from its cited source, and the item stays unresolved until a human chooses a
calendar day or leaves it unscheduled. Schema validation checks shape,
bounds and literal excerpts. Semantic support for paraphrases requires human
review. The prompt treats source as untrusted data, asks for uncertainty,
and provides no tools.

LIVE_AUTHORIZED=false. The normal Develop action plan control is disabled,
and an HTTP request for live schema v2 returns LIVE_DISABLED without queuing
work. Tests inject mock adapters into the durable worker in isolated
PostgreSQL schemas. Mock outputs and v2 replay are visibly labeled. Manual
planning uses no provider. The owner must separately verify genuine Free Tier
eligibility and explicitly authorize the first non-sensitive live request.

## Phase 5B — Gemini 3.5 Flash-Lite, live gate closed

This is the current configuration. Earlier phases describe their historical
model, quotas, and retry policies.

- Exact model ID: `gemini-3.5-flash-lite`.
- Standard text Developer API endpoint:
  `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`.
- The request uses `generationConfig.responseMimeType: application/json`,
  `responseJsonSchema`, and a maximum of 4,096 output tokens. No tools,
  grounding, batching, priority tier, or paid provider features are requested.
  Schema version 2, pipeline `plan-2`, and prompt `grounded-plan-3` are pinned
  per new run. Schema v1 rows, results, and replay remain readable. The live
  endpoint creates v2 jobs only.
- Google's [model card](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)
  lists structured output. The [GenerateContent reference](https://aistudio.google.com/api-reference/generate-content)
  describes the two JSON response fields. Google [lists free standard text
  input and output](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)
  for eligible Free Tier projects. Local tests verify the exact request shape
  and response handling. An actual response to this schema under the
  Threadline project key remains unverified. String lengths and evidence
  grounding are enforced locally independently of the provider schema.
- The owner identified `threadline-gemini` as a Free Tier project with no paid
  billing and observed 15 RPM, 250,000 TPM, and 500 RPD. Those settings can
  change. [Google applies limits to the whole project and resets RPD at
  midnight Pacific](https://aistudio.google.com/docs/rate-limits). App accounting
  covers dispatches from workers sharing one Threadline PostgreSQL database.
  Other keys, clients, and installations are outside that accounting.
- The app reserves serialized UTF-8 request bytes, the full output ceiling,
  and additional framing headroom. It accepts at most 10 reservations and
  180,000 estimated tokens in a rolling minute, at least six seconds apart,
  with one active dispatch. It admits up to 240 project and 20 owner attempts
  per Pacific day, counting queued work at admission, and limits waiting
  requests to 40 project-wide and four per owner. A 429 writes a shared
  cooldown until the later of the next Pacific midnight and a valid
  `Retry-After` HTTP header. New sources may be submitted after the cooldown.
- Production live dispatch has no automatic resend. A revision maps to one
  run for the pinned model and pipeline even when different request keys are
  used, including after failure or interruption. Temporary queue limits
  reject before creating a run. Cancellation and timeout fence out late
  results and retain the reservation. Google may still finish a request
  after the local HTTP connection closes.
- Before submitting, the Brain Dump UI tells users Google may use Free Tier
  input and output to improve its products. Avoid sensitive notes and check
  the [Gemini API terms](https://aistudio.google.com/docs/terms) for the project
  and region. Users must confirm suggested actions before any tasks can be
  created.

### Separate first-call authorization

Leave `LIVE_AUTHORIZED=false` and the code-side Free Tier approval empty
until the owner explicitly authorizes the one-request pilot. The authorization
must be short-lived and bound to the verified server-side key fingerprint and
the UUID of one isolated, synthetic, non-sensitive source revision. Keep the
actual key in Replit Secrets. Reconfirm the model, controls, project's
unpaid tier and absence of paid billing immediately before the test. The
GenerateContent API cannot certify billing status. If any check is uncertain,
keep the gate closed.

In the separate test, submit that one revision and verify actual provider
access, schema acceptance, grounded evidence, reviewable persisted proposals,
and recorded execution. Close the gate again after the result or failure.
A malformed response, unavailable model, or 429 ends the attempt. Any wider
enablement requires a separate owner decision.

### Phase 5B.1 pilot preflight result

The owner authorized one synthetic request for `threadline-gemini`. Preflight
confirmed the pinned model and endpoint and that the server-side key was
present. The workspace had no authenticated access to project settings to
confirm current Free Tier, absence of paid billing, and key association.
The pilot stopped before dispatch with zero requests. The gate remained closed
and the isolated integration test verified `LIVE_DISABLED`. Response
acceptance, generated actions, evidence validation, persistence, and live
recorded execution remain pending the authorized pilot.

### Phase 5B.1 authorized request outcome

The owner subsequently reconfirmed Free Tier, absence of paid billing, and
the key's project association. One request with the pinned model, prompt,
and schema returned HTTP 400. The adapter reported `PROVIDER_REJECTED`
and discarded the provider error body. The cause remains unknown. The run
recorded source validation and failed extraction, with no output validation,
proposals, or tasks. The one-shot allowance was consumed and revoked. The
ordinary adapter and API gates remain closed. Any new live request requires
fresh owner authorization.

### Phase 5B.2 offline contract review

The wire fixture pins the serialized `planningRequest()` for a synthetic source. The request uses text parts in `systemInstruction` and `contents`, with `responseMimeType: application/json` and `responseJsonSchema` in `generationConfig`. Nullable types are documented, and the 4,096-token cap is within the model's 65,536-token output limit. Neither observation establishes why the pilot failed. [GenerateContent reference](https://aistudio.google.com/api-reference/generate-content) · [Model limits](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)

Nested array bounds increase the grammar size and can trigger HTTP 400. The revised provider schema removes array bounds and string-length keywords, pins version 2 with a single-value enum and retains the same required fields and nullable proposal. The local validator enforces all original limits and evidence checks before persistence. New runs record `grounded-plan-3`; earlier runs retain their recorded versions. A pending run pinned to an older v2 prompt fails the existing configuration check. [Structured-output guide](https://aistudio.google.com/docs/structured-output#simplifying-complex-schemas)

On HTTP 400 the worker logs the run ID, HTTP status, and recognized Google status or canonical request fields when present. Only allowlisted field names from structured BadRequest violations can reach the log. Messages and arbitrary path suffixes are discarded. Diagnostic reads are capped at 8 KiB, 128 reads and 500 ms. An unreadable body still yields an ordinary provider rejection. Only the generic code reaches the run history and client.

Zero provider requests were sent during this investigation. Both authorization gates are closed. The pilot response cannot be reconstructed, and offline checks cannot establish project-specific acceptance.

## Phase 5B.3 — Second authorized pilot

A single authorized v1beta generateContent request to `gemini-3.5-flash-lite` with `grounded-plan-3` received HTTP 200 and parseable JSON. Four action titles matched the four expected topics. The strict validator rejected at least one evidence entry with `EVIDENCE_MISMATCH`. The trace ended at output validation with zero persisted proposals or tasks. This confirms provider acceptance for this request only. It does not establish the cause of the earlier 400. The temporary allowance was consumed before dispatch and removed with the isolated fixtures. Both ordinary gates remain closed.
