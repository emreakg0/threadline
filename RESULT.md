# Threadline Phase 2C — durable processing and execution history

Implemented Phase 2C only. Live Gemini remains **DISABLED / UNVERIFIED** with
LIVE_AUTHORIZED=false. No inference request, GEMINI_API_KEY access/change, billing
change, paid service, dependency install, repository rename, deployment or Phase 3.

## Behavior

POST /api/extractions now commits an owner-scoped queued run and event before 202.
It pins a saved immutable revision and metadata; same-key submissions return the same
run. The API worker claims under short database locks, then releases its connection
before adapter waits. One active run across processes, 30s leases, 5s heartbeats,
12s abortable provider wait and token/status/expiry fencing protect late writes.

Real validate_source/extract/validate_output/persist stages have timestamps, durations,
attempts, safe outcomes and linked events. Every event writer locks the parent run
and allocates the next sequence in the same transaction. Existing append-only trigger
is retained. Validated blocks/evidence, persist success and run completion are atomic;
all blocks stay needs_review. Sources/documents/tasks are not mutated by processing.

Startup and each poll reconcile up to 50 expired running jobs. They become interrupted
with explicit recovery events; uncertain provider outcomes are NOT resent. Only known
transient failures schedule one retry after 1s; at most two extract attempts. Old queue
reservations cannot evade dispatch-day caps (20 project/6 user attempts per UTC day;
10 project/3 user created runs/day). A 429 pauses the project for 24h. These are app
ceilings, not proof of Google's project quotas.

Owned cancellation fences results immediately and holds in-flight capacity until
acknowledgement/expiry. It cannot undo a remote request. Added bounded run history,
step pages and ordered event cursor APIs; repeated reads/restarts do not invent events.
Capture discovers the latest revision run and polls actual status, with refresh/cancel
and the existing Free Tier data-use notice. No visual diagram or replay controls.

## Changed files

- extraction/service.ts: replace synchronous work with durable queued creation.
- New extraction/lifecycle.ts: short transactions, event sequencing, recovery/cancel.
- New extraction/claims.ts: capacity, quota, configuration and token-lease checks.
- New extraction/worker.ts: bounded runtime loop, stages, aborts and fenced persistence.
  These responsibilities had no reusable durable implementation in Phase 2B.
- extraction/gemini.ts: optional abort signal; closed authorization gate preserved.
- API index.ts: start the worker after database readiness.
- routes/extractions.ts: 202 contract and owned history/detail/steps/events/cancel.
- lib/db/src/index.ts: export existing PoolClient type for transaction helpers.
- ExtractionPanel.tsx: real pending/terminal state, bounded polling and cancellation.
- New durable.test.ts/worker.fixture.ts: actual mock-worker crash tests. Existing
  extraction/document/browser tests and API test command extended for the new contract.
- THREADLINE_ARCHITECTURE.md, GEMINI_INTEGRATION.md, PROJECT_STATUS.md and
  DEVELOPMENT_LOG.md updated. Existing tables reused; migration 0004 only relaxes the timing constraint for
  unstarted terminal jobs. Runner, readiness and foundation test updated. No dependency
  or supply-chain change.

## Verification

Passed focused durable tests with real PostgreSQL locks/transactions and mock adapters:
concurrent duplicate/different-key submissions, competing claims, 20 simultaneous
per-run event writers (contiguous unique sequences), actual child SIGKILL during a
provider wait and while an INSERT was blocked, expired-lease startup reconciliation,
duplicate recovery, stale/cancelled result rejection, bounded retry/exhaustion, real
12s timeout of a hung mock, project quota pause and rollback of partial block/evidence
writes when the second insert fails. No mock result is labeled a Gemini success.

Passed Phase 2B strict JSON/kind/quote/Unicode/ambiguous-deadline validation and
mock persistence/error tests. Existing auth/document/API tests pass, including foreign
history/step/event access rejection and identical persisted event data after restart.

Commands passing:
- pnpm --filter @workspace/api-server exec tsx src/extraction/durable.test.ts
- pnpm --filter @workspace/api-server test
- pnpm typecheck
- pnpm --filter @workspace/productivity-app test
- Frontend and API production builds
- pnpm --filter @workspace/db test:foundation
- pnpm --filter @workspace/productivity-app test:security
- pnpm audit (no known vulnerabilities)
- Capture browser harness with isolated DB/worker: desktop/mobile, queued-to-
  LIVE_DISABLED outcome, existing save/retry/history/conflict/archive/City navigation.

Initial typecheck failed on the overloaded pool.connect return type; fixed with the
existing exported PoolClient type. A browser-harness edit anchor initially failed and
was corrected. Final targeted checks pass. Existing lazy city chunk advisory remains.
Capture mobile screenshot inspected. Full city-count browser tests were not repeated:
no city-specific source changed; city/scenery/camera/spring tests and City navigation
regressions pass. Physical GPU, live OAuth and published Replit behavior are unverified.

## Limits and next step

No exactly-once HTTP guarantee: an aborted/killed request may have executed remotely.
An uncertain expired run stops interrupted instead of risking another charge. A
continuing database outage can delay recording recovery. A stopped/sleeping Replit
instance cannot execute work; queue resumes on API startup. Explicitly creating a
new key can request another run, subject to quotas; interrupted runs never auto-resend.
Cancellation cannot refund/undo remote inference. No external free-tier verification
or real provider response behavior is claimed. Existing extractive-only evidence rules
remain: paraphrases are rejected, source truth/classification still needs human review.

Migration 0004 preserves existing rows and validates its expanded timing check before
removing the older stricter check. It avoids inventing a started_at for a queued job
that is cancelled or fails before work starts. Queued cancellation with null start
and actual completion is tested. Migration 0004 was applied to the configured
application database after isolated upgrade/rerun verification; no source/task/history
rows were rewritten. The local API workflow was restarted after readiness moved to
0004; this is local development, not deployment.

Rollback: stop workers and revert application adoption while retaining queue/history
and the expanded timing constraint. Review pending runs before using older synchronous
code; do not falsify history to restore the old check. No destructive down migration.

Stop for owner review. Phase 3 and any first live test require separate authorization.
Live testing still requires manually confirmed Free Tier/no paid billing, exact model/
endpoint/features, current quotas and explicit first-call approval. Source milestone:
`Add durable extraction queue and fenced execution history`; commit/push follows the
repository's staged review, secret audit and private-origin checks.

Final scoped review checked authentication/ownership, SQL parameters, event locks,
lease fencing, cancellation capacity and atomic saves. Timing/dispatch issues found
in review were corrected and retested; no remaining blocking finding identified.
Local smoke: /api/healthz 200 and unauthenticated /api/extractions 401 after restart.

Verified milestone source is committed and pushed to the existing private origin
under `Add durable extraction queue and fenced execution history`. Staged files were
reviewed, secret audit passed with zero findings, and repository privacy was confirmed.
Git remotes and existing history are preserved. Stop here for Phase 2C review.
