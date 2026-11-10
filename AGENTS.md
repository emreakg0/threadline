# Focus City development instructions

Focus City is a private task workspace where persisted tasks become buildings and projects become neighborhoods. Preserve the existing application and user changes; never rebuild it from a starter.

## Read before working

Read PROJECT_STATUS.md and DEVELOPMENT_LOG.md before development. Inspect the actual code and Git diff before assuming a feature works. Distinguish code present, automated verification, visual verification and unverified external integrations.

## Architecture and structure

- pnpm workspace; React 19, TypeScript, Vite and Tailwind frontend in artifacts/productivity-app. App.tsx owns authentication, task forms and filters; src/api.ts handles same-origin requests.
- src/city contains lazy React Three Fiber/Three.js rendering, procedural instanced architecture/scenery, persistent-slot layout, camera composition and tests. Buildings must represent real persisted tasks; decorative scenery must not impersonate tasks.
- Express 5 API in artifacts/api-server; src/routes/focus.ts implements Google OAuth, PostgreSQL sessions and ownership-scoped project/task operations.
- lib/db contains the pg pool, additive SQL migrations and migration/browser scripts. Stable city slots are allocated by database triggers. lib/api-spec and generated client/Zod packages currently cover only the starter health contract.
- FOCUS_CITY_SETUP.md documents local operation and configuration. artifacts/mockup-sandbox is template tooling.

## Workflow and continuity

Work autonomously on ordinary technical decisions. Preserve Google authentication, database persistence, ownership isolation, task management, stable coordinates and List View fallback. Never substitute hardcoded demo tasks for real data.

Run applicable checks: pnpm typecheck; pnpm --filter @workspace/productivity-app test; frontend/API builds. Run API integration tests when a configured database is available; they use isolated fixtures. For city changes run the browser harness with CITY_TEST_COUNT=0,1,5,20 and inspect desktop/mobile screenshots; software rendering does not verify physical GPU performance. See status/setup for launch details.

After each meaningful milestone, update PROJECT_STATUS.md with evidence, limitations and the exact next unfinished task; append changes, reasons, affected files and test outcomes to DEVELOPMENT_LOG.md. Keep these instructions accurate. Create a meaningful commit for completed, verified milestones, explicitly reviewing the staged diff and excluding secrets. Push completed milestones automatically to the private GitHub origin, currently https://github.com/emreakg0/focus-city, as authorized by the user. Do not attribute pre-existing work to the current session.

Before each push, run `python3 scripts/secret-audit.py`, review newly staged files for sensitive data, and verify `gh repo view emreakg0/focus-city --json isPrivate` still reports private. The audit checks history and tracked files without printing secret values; heuristics do not replace review. Never force-push, delete a repository or make it public without explicit permission. If a push is rejected, fetch and inspect the remote changes, preserve both histories and resolve normally; report blockers without overwriting work. Preserve the existing gitsafe-backup remote. See GITHUB_BACKUP.md for recovery and milestone commands. GitHub stores source history, not live PostgreSQL data or runtime secrets; do not upload either as a backup.

Never expose credentials, print secret values, commit secret files, delete user data, change security settings, incur paid charges, deploy or publish without explicit permission. Test cleanup may remove only fixtures created by that test. Do not discard existing edits. Persistent memory depends on keeping these files with the repository; it cannot guarantee recovery of files outside it.
