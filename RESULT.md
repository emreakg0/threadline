# Threadline Phase 1 result — 2026-11-16

Phase 1 is complete as a reviewed-source and tested storage foundation. Phase 2 has
not started. The existing Focus City interface, Google authentication, PostgreSQL
records, task/project operations, security controls and city implementation remain.

## Changes

- THREADLINE_ARCHITECTURE.md: approved module boundaries, storage/API contracts,
  design tokens/motion direction, recovery design, migration/rollback and next scope.
- lib/db/migrations/0003_threadline_foundation.sql: additive documents, immutable
  sources, editable blocks/evidence, flat collections, tags, relationships, runs,
  steps/events and task links. Composite references enforce owner consistency;
  uniqueness prevents duplicate run requests, event sequence values and task links.
- lib/db/scripts/migrate.mjs: registers migration 0003 using the existing transaction
  and advisory lock. Running API dev in the future will apply it automatically.
- lib/db/scripts/threadline-foundation.test.mjs and lib/db/package.json: isolated
  populated-schema migration and integrity tests; run with
  `pnpm --filter @workspace/db test:foundation`.
- PROJECT_STATUS.md and DEVELOPMENT_LOG.md: milestone evidence and next task.

## Verification

PASS: foundation tests (populated legacy upgrade, migration rerun, unchanged legacy
fixture rows, cross-owner reference/link rejection, immutable sources/events,
idempotency, evidence bounds, unique event sequences, duplicate conversion).

PASS: `pnpm typecheck`; frontend tests; frontend and API production builds;
API integration tests; frontend security tests. `pnpm audit`: no known vulnerabilities.
`git diff --check`: passed. Existing city bundle-size advisory remains.

The shared application database was not migrated. Migration SQL ran only in a random
isolated test schema, which was removed. Existing API integration used its isolated
fixtures. No browser visual checks were performed because the interface did not change.
Historical live OAuth and physical-device acceptance gaps remain unverified.

## Limits and decisions

This is a schema foundation, not functioning knowledge/extraction/replay UI. API
ownership queries, exact source-substring evidence validation, worker transitions,
lease recovery and replay remain future implementation. Event sequence uniqueness
is enforced; future writers must allocate sequence under a run lock. Collections
are flat initially; nesting requires cycle-safe follow-up. Deletion of linked tasks
requires explicit unlinking once conversion is implemented. Rollback retains the
additive tables to avoid data loss. No new runtime dependencies or packages installed.

No credentials created, AI requests made, paid API configured, repository renamed,
or application deployed/published. The pre-existing untracked frontend components.json
was preserved and excluded from this milestone.

## Review boundary

Stop here for Phase 1 review. After approval, the next task is owner-scoped document
and source APIs plus persistent capture. AI provider/model and credential/spending
setup require separate authorization. City removal remains deferred until replacement
verification. Future completion reports should continue to be written to RESULT.md.

## Source milestone

Milestone commit: `Establish additive Threadline storage foundation`.
The staged file set was explicitly reviewed; the secret audit passed with zero
findings and GitHub origin privacy was confirmed. This milestone is backed up to
the private origin; the existing gitsafe-backup remote is retained.
