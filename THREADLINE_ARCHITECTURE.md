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

## Phase 2C — durable processing (supersedes synchronous Phase 2B)

Existing queued status, lease_token, lease_expires_at, heartbeat_at, steps and
append-only events cover the durable design. Migration 0004 only expands the timing
constraint so unstarted cancelled/failed jobs have an actual completion timestamp
without a fabricated started_at; existing data is untouched. POST /api/extractions now
commits a pinned-source, owner-scoped queued run and its queued event before returning
202. Stable owner/idempotency keys return the existing run; different-source reuse
is 409. Existing capture sources, tasks and generated needs_review semantics remain.

The API entrypoint starts one polling loop after database readiness. Creation and
claim/capacity checks serialize with a short transaction advisory lock. claims.ts
uses row locks/SKIP LOCKED and a 30s token lease; one active run across processes.
worker.ts releases connections before adapter waits and heartbeats every 5s through
short pool queries. It bounds provider wait at 12s (including misbehaving mocks),
passes an abort signal and fences every result/state write by status/token/expiry.
Transactions have 2s lock/5s statement timeouts. No open transaction spans inference.

lifecycle.ts allocates event sequences under SELECT ... FOR UPDATE on the parent run
and MAX(sequence)+1 within the state transaction. Failed transactions consume no
sequence; event UPDATE remains forbidden by the existing trigger. Explicit observed
clock_timestamp plus actual step start/end/durations record validate_source, extract,
validate_output and persist. Steps link events to the right run/owner. Block/evidence,
persist-step success and terminal completion commit together. Failure leaves no
partial output; persist start remains a truthful prior observation.

Startup and each worker poll reconcile up to 50 expired running leases. Running
steps become interrupted; the run records interrupted and recovered events with
OUTCOME_UNCERTAIN and an explicit decision NOT to resend. This avoids charging for
an uncertain call. Recovery is idempotent and late workers cannot commit output.
Known PROVIDER_TRANSIENT failures alone schedule one durable retry after 1s. Claim
counts persisted extract attempts; never more than two. Timeout/auth/safety/invalid
output/quota/storage errors are terminal. A storage outage may leave the lease to
expire; reconciliation records uncertainty when the database is available again.
No claim of exactly-once external HTTP execution or recovery of an unsaved response.

App ceilings stay 10 queued runs/project and 3/user per UTC day, reserving two calls.
Claim also limits actual dispatch-day attempts to 20/project and 6/user, preventing
old queues from bypassing a new day's reservation budget. A recorded 429 pauses
project dispatch/creation for 24h. These are conservative app caps, not Google's quota
entitlements. Unknown model/schema/pipeline/prompt configurations fail closed.

Owned cancellation supports queued/running runs; terminal cancellation is a no-op.
It fences output immediately, records cancelled and closes running steps. A cancelled
running run reserves its capacity until worker acknowledgement or lease expiry;
abort cannot undo an external request. This prevents replacement jobs from bypassing
in-flight capacity. No automatic retry of interrupted/cancelled/failed terminal runs.

Read APIs (all authenticated/no-store):
- GET /api/extractions?source_revision_id=<UUID>&offset=0: 50 newest owned runs,
  next_offset; optional exact revision filter, offset at most 100000.
- GET /api/extractions/:id: owned run and validated results/evidence.
- GET /api/extractions/:id/steps?offset=0: 50 ordered step records, next_offset.
- GET /api/extractions/:id/events?since_sequence=0: up to 100 ascending events,
  next_sequence and has_more. Repeated reads/restarts do not invent events.
- POST /api/extractions/:id/cancel: existing write-origin/auth ownership checks.

Capture discovers the latest run for its immutable revision and polls real state
(up to 60 reads, then explicit Refresh status). Unknown request outcome retains the
same idempotency key. It offers cancellation and retains the free-service notice;
queued/running does not imply Gemini was called. No Phase 3 playback UI is added.

Rollback: stop new workers, revert application adoption while retaining queued/history
storage; inspect pending jobs before using the older synchronous implementation.
Retain the expanded timing constraint on rollback; old code remains compatible.
Do not restore the stricter constraint by rewriting valid new history. A sleeping/stopped Replit instance cannot
execute jobs; durable queue resumes/reconciles on the next API process start. No
always-on-hosting, live OAuth, real-provider or production Replit claim is made.

## Phase 3 — read-only How It Works and replay

Capture links to #capture/runs (history) and #capture/run/<owned UUID> (shareable run
location for authenticated owners). The Capture editor stays mounted/hidden while
inspecting a trace so unsaved text survives returning. Existing Focus City remains.
No backend worker, source schema, live gate or inference capability changed.

trace.ts projects only safe run/step/event fields from existing authenticated APIs;
blocks, source text and lease tokens are not rendered by the inspector. It consumes
all step/event pages, validates IDs/timestamps/cursor advancement, rejects conflicting
duplicate IDs/sequences and foreign run references, deduplicates and sorts by sequence.
Missing sequences, unavailable step references, unknown types/status and backward
observed timestamps produce explicit warnings instead of reconstructed activity.
No partial playback is shown if a page fails. Limits: 2000 pages per trace collection;
history pages remain explicit Load older runs. Offset history is not a snapshot.

replay.ts is a pure deterministic projection. Saved source is recorded when queued
is observed; validate_source/extract/validate_output/persist nodes follow actual step
start/completion/failure events. Legacy/unknown stored stage keys get extra nodes.
Absent observations remain not observed. A recorded interruption/cancellation closes
an observed started stage; recovered is an observed recovery decision, never success.
Final stored step status/duration is separately labeled in the inspector and does not
leak terminal outcomes into earlier node states at the replay cursor.

Playback order is event sequence, not row offsets or timestamps. The interval between
observed events is clamped to 300–1800ms at replay 1x, with 0.5x/1x/2x bounded speeds.
This deliberately expands short stages and compresses waits. UI labels replay time
separately from actual observed span and stored step wall-clock durations. Play/Pause,
Restart, previous/next event and range seek never invoke processing or mutate runs.
Reduced motion disables automatic playback but retains the event log/manual controls.
Keyboard and touch controls and polite cursor announcements use native elements.

HowItWorks.tsx handles history, run links and bounded refresh (30 reads at 3s for
queued/running), while ExecutionReplay/TraceInspector handle deterministic controls
and metadata inspection. Connected nodes use restrained CSS and visible text states;
no fake beam, diagram activity, 3D or Phase 4/5 navigation redesign is introduced.
Mock provenance is explicit; real LIVE_DISABLED failures remain failed.

Verification uses normal queue/worker/recovery/cancel services with mock adapters in
an isolated schema. Test-only response page slicing exercises all-page loading using
unaltered real persisted events. Serialized trace IDs/sequences/statuses/timings match
after browser reload; replay leaves total run count unchanged. Cross-owner detail,
event and step requests return 404. No provider calls or production mock successes.

## Phase 4 — workspace, organization and block review

The authenticated Threadline shell uses existing hash navigation. Knowledge is
at #capture/library, documents at #capture/document/<UUID>, review at
#capture/review[/<UUID>], and collections at #capture/collections. Phase 3 run
URLs still resolve. Capture stays mounted through navigation, including Focus
City. Dirty documents and new captures retain their IDs, saved base versions
and text in memory until saved, discarded or the page closes. Unsaved review
edits also stay mounted across workspace navigation. Reload prompts about
unsaved work. Focus City remains the default entry pending owner design
acceptance.

The document list supports literal case-insensitive title and latest source
matching, active/archived views, collection and tag filters, and a review
filter. It returns collection, active tag and pending-review metadata. Lists
are paginated. The query is scoped to the signed-in owner. Search is bounded
substring matching for a personal library. Large-library search indexing and
cross-request pagination snapshots remain future work.

GET/POST /api/documents/organization list active organization labels and
create flat collections. Versioned document PATCH assigns or clears a
collection and replaces document tag assignments in the same transaction as
other document changes. The schema's scoped foreign keys and API owner check
both apply. Collection/tag changes preserve the current immutable source
revision. Tags are reused by exact name within an owner.

GET /api/documents/:id/blocks pages a document's knowledge blocks and original
source excerpts. Optional filters select kind, review state or an exact block.
PATCH /api/documents/:id/blocks/:block requires the expected version and checks
owner, document and block together. A content change sets edited_at and returns
the block to needs_review unless the request explicitly specifies a state.
The original uncertainty, exact source evidence and originating run association
stay attached. The UI presents evidence as a separate quote from the source
revision. No review operation creates a task or changes extraction history.

Migration 0005 introduces the nullable edited_at field with a lock timeout.
Apply migrations before serving the new app. Older app versions can continue
reading the expanded schema. For application rollback, leave the additive
column in place to preserve edit provenance. No backfill is needed because
earlier releases could not edit extracted blocks.
