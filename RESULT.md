# Threadline Phase 2B — live DISABLED / UNVERIFIED

Implemented: modular server-only Gemini adapter; authenticated owner-scoped extraction
of a saved immutable revision; idempotency; strict versioned JSON and exact Unicode
code-point evidence validation; atomic needs_review blocks/evidence; real minimal
run/step/event and error/retry records. Capture has Organize with AI, a data-use notice,
truthful disabled feedback and read-only results. Existing capture/auth/city/tasks stay.

No live provider requests occurred. No credential was read/modified, printed or exposed.
No dependency install, paid inference, billing change, deployment, rename or Phase 2C/3.

Selected: gemini-2.5-flash-lite, standard text only, POST
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent .
Google public pricing lists standard input/output free of charge:
https://aistudio.google.com/docs/pricing#gemini-2.5-flash-lite . Structured output:
https://aistudio.google.com/docs/structured-output ; project-wide rate limits:
https://aistudio.google.com/docs/rate-limits . Public eligibility is not project proof.
Owner confirmation of genuine Free Tier without paid billing, exact free features and
permission for first test call is outstanding. LIVE_AUTHORIZED=false blocks before
secret access. No environment setting or mock fallback enables production inference.

Tests passed: focused isolated mock/DB extraction tests (valid outputs, malformed JSON,
wrong kinds/unknown keys, invented quote/content, emoji offset mismatch, ambiguous
relative deadline, source ownership, duplicate submit, 429, timeout/model/auth errors,
transient retry, failed block save rollback, needs_review/source integrity/no tasks).
Existing document/auth/API tests plus extraction route ownership pass. Workspace
typecheck, frontend tests, frontend/API builds, frontend security and pnpm audit pass.
Capture browser suite passes including explicit LIVE_DISABLED action and existing
save/retry/history/conflict/archive/City navigation. No live Gemini HTTP or actual
project-free-tier verification is claimed. Existing city chunk warning remains.

Files: server extraction/{validation,gemini,service,extraction.test}.ts separates schema,
provider, persistence and tests because no previous extraction implementation existed;
routes/extractions.ts adds the owner-scoped endpoints, mounted by routes/focus.ts.
ExtractionPanel.tsx adds the isolated review surface to CaptureEditor.tsx. API test
script, document integration/browser tests and architecture/Gemini/status/log updated.
No new schema needed; existing tables reused. No source/task mutation or fake diagram.

Limits: extractive content must equal a cited quote; paraphrased summaries are rejected.
Exact evidence does not prove the source true or model categorization correct. All
outputs need human review. Every deadline requires uncertainty; no inferred dates.
Zero-to-24 blocks, 1–8 evidence spans/block, 1200-char fields, 4096 output tokens, 12s
provider timeout. DB lock permits one extraction; app ceilings reserve two attempts
per run (10 project runs/3 user runs per UTC day), 429 pauses for 24h. These are app
limits, not verified Google allowances. Synchronous requests, no durable recovery:
process death can leave running records; DB outage can prevent failure recording.
Phase 2C will address leases/recovery/full events. Replay/graph not implemented.

Stop for review. Before any live test, separately confirm the project's billing/free
status and exact model/features, then explicitly authorize one non-sensitive test.
Recheck model pricing/availability and active quotas at that time. Do not start Phase
2C automatically. Source milestone will be committed/pushed following secret audit
and private-origin verification; see Git history for the resulting commit.
