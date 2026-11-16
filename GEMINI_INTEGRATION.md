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
