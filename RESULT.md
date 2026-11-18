# Threadline Phase 4 — Knowledge workspace

Open **Threadline** from Focus City or go to `/#capture`. Phase 4 includes a
responsive workspace shell, source editor, Knowledge Library, flat Collections,
structured Review, and existing recorded How It Works. The authenticated default
stays on Focus City pending owner design acceptance. The workspace provides a
Focus City shortcut and preserves unsaved work across the round trip.

## Delivered

- The keyboard command palette opens with Cmd/Ctrl+K. It searches document
  titles and latest saved source, opens active or archived results, jumps to
  workspace sections, and restores prior focus on dismissal.
- Capture retains stable create retries, explicit save status, exact immutable
  source versions, optimistic conflict comparison, archive/restore, and
  in-memory drafts across navigation. Collection assignment and tag changes
  save with the document version.
- Knowledge and Collections provide literal title/content search, active and
  archived views, collection and tag filters, flat collection creation,
  paginated documents, and pending-review metadata.
- Review filters extracted blocks by kind and state. Confirm, dismiss, reopen,
  or edit a block. Writes require an expected version. Conflict recovery
  compares saved text and keeps the draft. Edited wording and confirmation
  have distinct labels. The originating run, immutable source excerpts and
  original extraction uncertainty remain attached. Review creates zero tasks.
- How It Works retains recorded run history, stage and event ordering, replay
  controls, mock labels, and error/recovery semantics. Phase 4 integrates the
  view into the shell and fits run history on narrow screens.
- Apply additive migration `0005_threadline_block_edits` with the existing
  migration runner before serving the new app. Tests applied it only in
  disposable schemas.

## Verification

- Workspace typecheck and frontend/API production builds passed. The frontend
  build retains the existing lazy city bundle-size advisory.
- Frontend tests and Vite security regressions passed. The package audit found
  no known vulnerabilities. No dependency installation or supply-chain change.
- Isolated API suites and foundation migration tests passed. New coverage
  includes owner-scoped collections, filters, tag assignment, concurrent block
  writes, persistence across HTTP restart, and exact evidence after review.
- Chromium verified first use, long titles and source text, search and filters,
  collection/tag writes, retried creation, revision history, document and
  block conflicts, draft recovery, archive/restore, keyboard palette and focus,
  320px touch and 390px layout, reduced motion, and Focus City/List View.
- The same harness verified persisted mock output and review, actual
  LIVE_DISABLED failure, real event pagination and replay, recorded retry and
  interruption recovery, cancellation, playback controls, and owner isolation.
- The separate Focus City browser harness passed 0, 1, 5 and 20 tasks in a
  disposable schema, including building selection, task editing, neighborhood
  switching and context-loss fallback. Inspected desktop/mobile city frames.
- Inspected screenshots at desktop and mobile widths for Capture, Knowledge,
  command palette, Review with source evidence, and recorded execution.
  Reproduce with Vite on 21646 and Chromium CDP on 9222, then run
  `pnpm --filter @workspace/api-server exec tsx ../../lib/db/scripts/capture-browser.mjs`.
  Screenshots are saved to `/tmp/threadline-4-*.png`.

## Scoped review

Ponytail Full and the scoped Ponytail and code-review passes covered state
transitions, data ownership, transaction and version boundaries, accessibility
and the isolated test paths for a personal library. Fixed rapid palette
reopen invalidating its second search, stale block conflict reloads under
filters, and review drafts being discarded when leaving a document. The browser
suite verifies recovery for each flow. Staged review and secret audit cover
source changes and test fixtures.

## Limits and next task

Drafts stay in memory during a session. Search matches the latest saved
source and uses paginated substring queries. Phase 4 leaves backlinking,
semantic search, graphs and action-to-task conversion for later scope.
Chromium tests used isolated fixtures and software rendering. Live Google
consent, device performance and screen-reader operation were outside this run.

LIVE_AUTHORIZED=false. No live Gemini requests, Gemini credential access, deployment,
or production data changes. Next unfinished task is owner review of the
workspace and a decision on the authenticated default entry. Phase 5 is
outside this milestone.
