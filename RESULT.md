# Threadline Phase 5A — Brain Dump to Action Plan

Open Threadline from Focus City or visit `/#capture` while signed in. Save a
brain dump, then choose **Open action plan**. Action Planning takes precedence
over the previously planned knowledge graph. The graph, backlinks, and
relationship visualization remain on the deferred roadmap.

## Manual planning

Brain Dump supports optional titles and keeps immutable source revisions,
save feedback, archive/restore, and draft and conflict protection. Each
saved dump has a persistent action plan. Users can add, edit, dismiss,
reopen, or approve manual actions. Approval requires an owned project, an
explicit priority, and a scheduling decision. Users choose the calendar
date themselves or leave the action unscheduled.

The plan groups actual actions into Needs attention, Ready to act, Scheduled,
Linked tasks, and Dismissed. After a user confirms task creation, one
transaction creates the task and records the conversion. Replaying the
request returns the same receipt. If the task is deleted, the receipt remains
and records that the task was removed. Linked tasks use the existing Focus
City task system and slot allocator. Status updates are visible in Plan
progress and the linked Focus City editor.

## Mock-tested AI planning

The durable worker uses grounded planning schema v2 with pinned pipeline and
prompt versions. It accepts draft paraphrases, a summary, suggested category
and priority, and unresolved deadlines. Evidence quotes must match exact
Unicode code-point offsets in the pinned revision. Model wording and
uncertainty stay alongside evidence and user-approved values. Legacy schema 1
still requires extractive quotes.

In the isolated browser run, the sample brain dump produced four explicitly
labeled mock proposals. The user selected a calendar date for the CS
assignment and left Calc 2 unscheduled. Two approved tasks persisted after
reload. Updating one to Done changed plan progress. Fixture checks also
verified a malformed-evidence run failed and the versioned recorded replay
used actual stored events.

## Live AI availability

LIVE_AUTHORIZED=false. Develop action plan is disabled and offers a route
into manual planning after saving. The public schema v2 request returns
LIVE_DISABLED without queueing work. Mock adapters were injected into the
existing worker only inside disposable test schemas.

## Verification

- Workspace typecheck, frontend tests, frontend/API builds, Vite security
  checks, package audit, migration tests, and the entire API suite passed.
- PostgreSQL integration tested manual conversion, trusted dates, stale
  versions and concurrent requests, project and session ownership, archive
  guards before dispatch and conversion, task-creation rollback, and deletion
  receipts. Invalid provider results remained off the plan.
- Chromium verified the full flow, editing conflicts and draft recovery,
  keyboard/focus movement, reduced motion, and desktop/mobile layouts. It
  also exercised the existing Capture, Knowledge, Collections, Review,
  replay, and Focus City/List View paths.
- The separate Focus City browser harness passed 0, 1, 5, and 20 task
  scenarios. Inspected desktop/mobile City frames and the Action Plan draft,
  scheduling groups, and linked progress. Images are in
  `/tmp/threadline-5a-*.png`.
- Scoped Ponytail/code review checked version isolation, proposal ownership,
  locking and rollback, link reuse and task deletion, and draft preservation
  for personal-workspace use. Fixed a transient Chromium reload poll and
  clarified the original uncertainty label after a user resolves scheduling.
  Staged review and secret audit passed.

Reproduce the main browser pass with Vite on 21646 and Chromium CDP on 9222,
then run
`pnpm --filter @workspace/api-server exec tsx ../../lib/db/scripts/capture-browser.mjs`.

## Limits and next decision

Apply migration `0006_threadline_action_plans` before starting the updated
API. Migration tests ran in disposable schemas. Validation proves quote
integrity and structure. Humans must still verify the meaning of generated
paraphrases. Projects and priorities are selected explicitly. Plan grouping
is per saved brain dump, and unsaved edits are session-local.

Physical-device and screen-reader behavior and live OAuth consent were
outside this verification. Live Gemini availability and Free Tier eligibility
remain unverified. The next task is owner review of manual and mock-tested
planning. Any first live inference requires separate eligibility verification
and explicit owner authorization. Stop at Phase 5A.
