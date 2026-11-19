# Threadline Phase 4.1 — Workspace refinement

Open Threadline from Focus City or visit `/#capture` when signed in.

## Design improvements

- Capture uses a document canvas with a wrapping title, readable source measure,
  and a compact save bar. Saved documents have a tools rail for review, source
  history, organization, and archive. On phones, the tools follow the document.
- The palette groups Quick actions, Navigation, and Documents. Shared line icons,
  selected-row feedback, and restrained floating material connect it to the shell.
- Knowledge uses compact document rows with separate title, collection, tags,
  date, and review status. Collections uses a dedicated navigator, with the same
  document list and filters in a separate pane.
- Review explains the workflow and disabled live processing when empty. Actual
  review blocks distinguish pending, confirmed, and dismissed states. Original
  quotations sit beside the block text on wider screens and stack below on phones.
- Tablet and phone navigation use compact header rows. Focus, reduced motion,
  contrast, and reduced transparency remain part of the scoped styles.

## Functional changes

- Returning from a document to the last browse view retains its filters and
  collection selection for the current session. The collection form is read-only
  while saving, so a completed request cannot clear a second name being entered.
- Source history focuses the panel on open and the launcher on close. Review has
  a block jump control, and editing conflicts appear beside the affected draft.
- The palette preserves keyboard search and document opening when trailing spaces
  leave the query unchanged. Existing extraction requests are labeled as requests
  and show the disabled live state.
- The interface uses the existing APIs, persistence, worker, and replay engine.
  There is no new migration or dependency.

## Visual verification

Inspected the previous and final Chromium renders with isolated PostgreSQL
fixtures. The final pass covered 1440px desktop, 820px tablet, 390px mobile,
and 320px narrow navigation. It included long-document editing, multi-document
Knowledge, three collections with assigned tags, command groups and search
results, empty and populated Review, a confirmed edit beside its exact source
excerpt, and recorded mock replay.

The checks surfaced clipped long titles, truncated palette helper text, and
competing scrollbars on mobile. Final screenshots show the wrapped title and
the palette's independent result scroll area. Focus outlines and page overflow
were also checked. Images are in `/tmp/threadline-41-*.png`. Reproduce with Vite
on 21646 and Chromium CDP on 9222, then run
`pnpm --filter @workspace/api-server exec tsx ../../lib/db/scripts/capture-browser.mjs`.

## Automated verification and review

- Workspace typecheck, frontend tests, frontend/API production builds, Vite
  security tests, and isolated API integration/extraction/durability tests passed.
- Chromium passed save and retry, Ctrl+Enter, immutable history and focus return,
  draft preservation, archive/restore, search and tags, return to collection,
  command keyboard and focus controls, block navigation, evidence integrity,
  review conflicts and persistence, replay, owner isolation, reduced motion,
  narrow touch navigation, and the Focus City/List View round trip.
- Actual LIVE_DISABLED outcomes and successful mock runs were verified with
  isolated fixture data. The package audit reported no known vulnerabilities.
- Scoped Ponytail and code review traced UI state, focus, write boundaries,
  retained filters, and fixture coverage for personal-workspace usage. The
  collection input race and narrow palette layout were resolved. Staged review
  and the secret audit passed.

## Remaining limitations and owner review

Collection totals are unavailable from the current API. Browse context is
session-local. The existing city bundle-size advisory remains. Live Google
consent, screen-reader use, and physical-device keyboard behavior were outside
the browser run. Live Gemini remains disabled.

Owner review should judge the reading measure, mobile tools placement, and
preferable document density with real notes. The next decision is whether to
accept the design and make Threadline the authenticated default. Work stops at
Phase 4.1.
