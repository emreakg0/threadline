# Threadline architecture baseline — Phase 1

Approved 2026-11-16. Incremental pivot of Focus City, not a replacement project.

## Boundaries and preserved behavior

React 19/TypeScript/Vite/Tailwind remains the client. Express and PostgreSQL remain
the server and storage. Keep Google OAuth, hashed sessions, write-origin checks,
no-store responses, ownership-scoped queries, tasks/projects, stable city slots,
and City/List views intact. No new route or UI is enabled by this milestone.

Future modules: documents (capture, revisions, editable blocks); processing
(provider adapter and validation); runs (durable jobs, events and recovery);
connections (manual links and reviewed suggestions). Existing task operations remain
authoritative for task state. Introduce modules only when their behavior is built.

## Storage contracts

0003 adds only threadline_* tables/functions/indexes. Existing tables and records
are untouched. UUID application IDs and text Google user IDs match current practice.
Composite foreign keys prevent cross-owner references; they do not replace API
read/write authorization. PostgreSQL role permissions are unchanged, and RLS is not
introduced. Do not expose these tables through an unscoped endpoint.

- documents: editable title, collection, optimistic version, timestamps, archive state.
- source_revisions: immutable text, per-document revision, optional capture timezone.
- knowledge_blocks: ordered typed content, version, review state, uncertainty reason,
  optional originating run constrained to the same document.
- block_evidence: source revision and block constrained to the same document; quote
  and zero-based half-open offsets. Phase 2 must validate exact source substring and
  normalize offsets consistently (JavaScript UTF-16 versus Unicode code points).
- collections: flat in Phase 1. Parent hierarchy and cycle checks are deliberately
  deferred until nested collection behavior is implemented.
- tags/document_tags: owner-scoped labels and assignments.
- relationships: typed directed edges, manual/model origin and review state. Suggested
  edges are excluded from the confirmed graph. Reverse edges are distinct.
- runs: pinned source revision, owner-scoped idempotency key, status, versioned
  pipeline/schema/provider/prompt metadata, retry lineage and lease/heartbeat fields.
- execution_steps: stable key and attempt, status, actual start/end/duration,
  input/output summaries, safe errors and recovery actions.
- execution_events: per-run unique positive sequence, observed time, optional step,
  typed event and versioned JSON object. Update prohibited; owner-scoped erasure is
  a future explicit operation. SQL owners can still delete: not tamper-proof logging.
- action_task_links: unique block/task association. Insert/update validates task owner
  and action kind without changing existing task tables. The FK intentionally blocks
  deleting linked tasks until a future transaction explicitly unlinks them. No links
  are created by existing functionality.

Content hashes, full-text indexes, nesting, and detailed artifact retention are
follow-up migrations when their consuming behavior is added. No speculative vector
storage or dependencies. Application must maintain updated_at/version, valid state
transitions, exact evidence, terminal timings, and action kind after linking.

## Future API and processing contracts

Authenticated same-origin document create/read/update, revision capture, run creation,
ordered event reads, and explicit action conversion will reuse existing session and
origin protections. Validate requests and responses at runtime; errors retain the
existing {error: message} convention with safe machine codes added where needed.
Scope every query by user_id. Conflict updates require the expected version.

Save source and queued run before acknowledging processing. Claim work with database
leases and locking; write step transitions and events in one transaction. Lock the
run row when allocating its next event sequence. Persist outputs and completion
atomically. Poll by sequence initially. Expired leases produce real interruption and
recovery events. Retries use separate attempts; no exactly-once provider guarantee.
Replay reads recorded history only and labels playback time scaling.

AI provider/model/credentials, data retention, consent and spending limits remain
future decisions. No AI requests or credential configuration in Phase 1. Model output
must validate against a structured schema and source evidence. Unsupported facts and
ambiguous dates remain unresolved. AI never autonomously creates tasks.

## Reusable interface foundation

Use existing spring.ts, native dialog focus behavior, TaskSheet and inspector patterns
where appropriate; do not assume the untracked shadcn config installed any primitives.
The existing UI remains unchanged during this storage milestone.

Tokens for the later cohesive shell: background #0D1016, sidebar #11151C, surface
#191E29, text #EBEAF3, secondary #858D9C, lavender #AAA1FF, mint #95DBC4, amber
#ECB77D. Validate rendered contrast. Use a 4px spacing rhythm, 14px UI/16px document
text, system font until Geist is separately approved, compact rows with 44px touch
areas. Solid document surfaces; translucency limited to floating chrome. Navigation
150–200ms, panels 220–280ms, interruptible springs; reduced motion uses static updates
or short fades. Never animate simulated processing activity.

## Migration, verification and rollback

The existing runner registers 0003 under its transaction/advisory lock. Migration-local
lock/statement timeouts bound waits; indexes cover new empty tables only. No backfill,
legacy index creation or legacy schema alterations. Startup remains compatible with
0002; do not claim new API readiness until those APIs exist.

Foundation tests run the actual runner twice in a random isolated PostgreSQL schema,
then test ownership/integrity and preserve a legacy fixture. They never migrate the
shared application schema. Apply the registered migration to an application database
only as an intentional subsequent operation; running API dev currently invokes the
migration runner automatically.

Rollback: revert application/runner adoption and retain additive storage. Dropping
populated tables would destroy user knowledge; no automatic down migration. The current
runner has no down operation. No runtime data backup is stored in Git.

## Milestone boundary

Phase 1 supplies storage, integrity tests and this architecture contract. It does not
supply endpoints, workers, extraction, search, editor, graph, replay UI or a redesigned
shell. Next milestone, after review: owner-scoped source/document API and capture
persistence, followed by real processing/event recording when separately configured.
No installs, paid AI, repository rename or deployment without separate authorization.

## Phase 2A — persistent capture (2026-11-16)

Implemented without AI. Capture is available through the existing sidebar's
Threadline Capture action and /#capture; Focus City remains the default root view.
The existing session/write-origin middleware mounts the documents router. All reads
and writes scope user_id; inaccessible UUIDs return 404. No public document routes.

API contracts (all responses no-store; all writes require the configured Origin):

| Method/path | Request | Result |
| --- | --- | --- |
| POST /api/documents | {id: client UUID, title, source_text} | 201 document with source revision 1; identical retry returns 200; ID collision/different payload 409 |
| GET /api/documents | archived=true/false (default false), offset (default 0) | {documents, next_offset}; up to 50 summaries ordered updated_at descending, ID tie-break |
| GET /api/documents/:id | — | document with latest source |
| PATCH /api/documents/:id | {version, title?, source_text?, archived?} | updated document/latest source; missing owner document 404; stale version 409 |
| GET /api/documents/:id/revisions | offset (default 0) | {revisions, next_offset}; 50 metadata rows, newest first |
| GET /api/documents/:id/revisions/:revision | — | exact immutable source revision |

Validation rejects unknown write fields, wrong types, invalid UUIDs, empty titles or
sources, NUL and malformed Unicode. Titles trim to 1–300 UTF-16 code units; source is
preserved exactly and limited to 20,000 UTF-16 code units. Existing 100KB HTTP body
limit stays active; oversized encoded bodies return 413. The schema's broader source
limit is unchanged. Offset is bounded at 100,000; pagination is not a cross-request
snapshot, so concurrent list updates may shift page boundaries.

PATCH locks the owned document row, checks expected version, and updates metadata
and appends any changed source within one transaction. No source update/delete API.
Title-only, archive, restore or identical-source saves do not create a source revision.
Version increments on each accepted PATCH. Archived sources remain retrievable and
restorable; the UI requires saving drafts before archive and disables editing until
restored. No hard deletion, AI block editing or collection UI in this milestone.

The client validates document/revision/list responses. Manual save and Ctrl/Cmd+Enter
are supported. Failed/uncertain saves retain drafts; stable capture IDs avoid duplicate
creation. Conflicts show the current server version beside the retained local draft;
replacement requires an explicit choice. Navigation/reload warns about unsaved work.
Drafts are in memory, not localStorage: closing after accepting discard loses edits.

0003 was applied to the configured application database using the existing runner;
no additional migration was needed. New API and browser tests independently run in
random isolated schemas and clean only their own schemas. Existing city browser tests
use isolated legacy fixtures. Tests never call Gemini. GEMINI_INTEGRATION.md defines
the separately authorized Phase 2B contract and strict $0/free-tier gate.

New code is separated by responsibility: documents.ts owns the authenticated API;
documents-api.ts owns client response validation/types; useCapture.ts owns capture
state and mutations; CaptureWorkspace.tsx owns navigation/library; CaptureEditor.tsx
owns editor/history surfaces; capture.css scopes tokens/styles to preserve the city.
The new browser harness uses existing Chromium/CDP without adding dependencies.

## Phase 2B — extraction boundary

Adds server extraction/validation.ts, gemini.ts, service.ts and routes/extractions.ts;
no schema migration or existing data transformation. Reuses the Phase 1 run/step/
event/block/evidence tables. Exact pinned revision ownership is checked before work;
source edits do not affect an existing run. Document/source/task writes are absent
from extraction. Atomically stores validated needs_review blocks/evidence and terminal
success. Failures use safe codes, never provider error text or source logs.

Capture adds ExtractionPanel with explicit action, Free Tier data-use notice, truthful
disabled/error feedback and read-only result blocks. Dirty/archived documents cannot
start extraction. No rebrand, graph, editor overhaul, replay or background worker.
Mock test provenance is explicit; default live adapter is hard disabled before key
access. See GEMINI_INTEGRATION.md for exact model, stricter extractive schema, quotas,
owner approval gate and known synchronous-execution/recovery limitations.
