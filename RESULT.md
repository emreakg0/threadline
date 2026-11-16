# Threadline Phase 2A — Persistent Document Capture

Completed 2026-11-16. Phase 2B has not started.

## What you can use

Sign in with the existing Google authentication, then choose **Threadline Capture**
in the Focus City sidebar, or open **/#capture**. Focus City remains available and
is still the root view; its city, tasks and projects are preserved.

Capture supports:

- Create, list, open and edit saved documents.
- Archive/restore, with separate active/archived lists.
- Exact original text and immutable source history. Changed source creates a new
  revision; title-only and identical-source edits do not duplicate source history.
- Manual save and Ctrl/Cmd+Enter, truthful saved/unsaved/error feedback.
- Optimistic concurrency: stale edits cannot overwrite a newer saved version.
  Compare the server copy while retaining your draft; replacement requires a choice.
- Retry of an uncertain create without duplicate captures.
- Desktop/mobile graphite surfaces, restrained lavender, labeled controls, focus
  indicators, touch targets and reduced-motion support.

## Implementation and files

- `artifacts/api-server/src/routes/documents.ts`: new document/revision API, needed
  because existing task routes do not model source history or document versions.
- `routes/focus.ts`: mounts documents after existing session/write-origin checks.
- `app.ts`: safe 413 response for the existing HTTP body-size limit.
- `index.ts`: startup requires the registered Threadline foundation migration.
- `documents.integration.ts` and API package test script: persistent isolated API tests.
- Frontend `documents-api.ts`: typed, runtime-validated document/revision responses.
- `useCapture.ts`, `CaptureWorkspace.tsx`, `CaptureEditor.tsx`, `capture.css`: focused
  capture state, navigation/library, editor/history and scoped design respectively;
  existing task components cannot supply these revision/conflict semantics.
- Frontend `App.tsx`/`api.ts`: additive navigation and status-aware API errors.
- `lib/db/scripts/capture-browser.mjs`: real browser regression using existing CDP;
  existing city harness is standalone and does not export reusable browser helpers.
- `THREADLINE_ARCHITECTURE.md`: endpoint contracts, limits and concurrency behavior.
- `GEMINI_INTEGRATION.md`: future Gemini contract and strict $0 gate.
- `DESIGN.md`, `PROJECT_STATUS.md`, `DEVELOPMENT_LOG.md`: design/evidence/continuity.
- `AGENTS.md`: persists your requirement to write completion reports to RESULT.md.

Applied the existing Phase 1 additive migration 0003 to the configured PostgreSQL
application database. No new migration was needed. Existing records/tables were not
renamed, replaced or backfilled. New tests used isolated fixtures/schemas and cleaned
only their own data. The pre-existing untracked components.json was left untouched.

## Verification

Passed:

- `pnpm typecheck`.
- `pnpm --filter @workspace/productivity-app test`.
- Frontend and API production builds.
- `pnpm --filter @workspace/api-server test`: existing Focus City suite plus document
  persistence/restart, ownership, validation, concurrent conflicts, exact immutable
  sources, archive/restore, create retries and failed-write rollback.
- `pnpm --filter @workspace/db test:foundation`.
- `pnpm --filter @workspace/productivity-app test:security`.
- `pnpm audit`: no known vulnerabilities.
- Capture Chromium regression: desktop/mobile, failed response after actual save and
  duplicate-free retry, reload persistence, source history, real conflicting update
  preserving draft, archive/restore, reduced motion and City/Capture navigation.
- City browser scenarios for 0/1/5/20 real fixture tasks, desktop/mobile.

Inspected desktop/mobile screenshots for Capture and every city count. Capture images
are `/tmp/threadline-2a-desktop.png` and `/tmp/threadline-2a-mobile.png` (ephemeral).
Reproduce capture checks with Chromium debugging on 9222, frontend on 21646, then:
`pnpm --filter @workspace/api-server exec tsx ../../lib/db/scripts/capture-browser.mjs`.
The harness owns an isolated API/proxy on 28126. No production auth bypass was added.

Scoped code/security review checked ownership, transactions, SQL parameters, rendering,
logging and errors; no blocking findings. Existing lazy city bundle advisory remains
988.28 kB / 265.33 kB gzip. Software WebGL does not verify physical GPU performance;
live Google consent and a published Replit deployment remain unverified.

## Boundaries and limitations

No Gemini requests, credential reads/changes, paid API configuration, billing changes,
AI dependencies, package installation, repository rename or deployment/publication.
Budget used for inference: $0; inference is absent from this milestone.

Phase 2B must verify the actual project is genuinely free with no paid billing, and
that its selected model/features are free-eligible. Otherwise remain disabled. No
quota exhaustion upgrade or paid fallback is permitted. Rate/schema/evidence/recovery
requirements are documented; they are not implemented provider behavior yet.

Drafts remain in memory until saved. Unsaved navigation prompts before discard; no
offline/localStorage draft recovery is claimed. Source limit is 20,000 UTF-16 code
units; titles are 1–300. Pagination is offset-based and not a snapshot across edits.
This milestone does not add AI blocks, processing runs, replay, graph or nested UI.

## Review boundary

Phase 2A is complete. Stop for your review. Phase 2B requires separate authorization.
The next task is reviewing persistent capture and its Gemini contract, not starting
inference automatically. Source milestone: `Add persistent Threadline document capture`.

## Source backup and preserved edits

The verified milestone is committed and pushed to the existing private origin under
`Add persistent Threadline document capture`. Staged files were reviewed, the secret
audit passed with zero findings, and repository privacy was verified before push.
The existing gitsafe-backup remote remains unchanged. While finalizing, a concurrent Replit Agent commit (0ee3284) captured the implementation
and also committed the pre-existing components.json and newly supplied AGENTS.md
efficiency rules. This session did not edit that configuration or author those rules.
The commit was preserved without rewriting history; both files were reviewed before
push. The follow-up commit 2b87774 records completion-report additions. No secret files
or live data were included in the source backup.
