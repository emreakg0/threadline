# Focus City — Phase 1 foundation

The existing Replit frontend and API service routes are preserved. Run their existing workflows. Outside Replit, Vite proxies `/api` to port 8080.

## Database

Set DATABASE_URL in Replit Secrets. Apply the additive, transaction-protected migration before starting the API:

```
node lib/db/scripts/migrate.mjs
```

It records migration history and may safely be run again. It creates only namespaced Focus City tables; it does not delete existing data.

## Google sign-in

Create a Google web OAuth client. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and APP_ORIGIN (the exact public origin, without a trailing slash). Register this callback:

```
https://YOUR-APP-DOMAIN/api/auth/google/callback
```

For local development, use APP_ORIGIN=http://localhost:5173 and register http://localhost:5173/api/auth/google/callback. The frontend and backend must share the browser origin through the development proxy. No passwords or Google tokens are stored. Sessions are stored as hashes in PostgreSQL and expire after seven days.

## Checks

```
pnpm typecheck
pnpm --filter @workspace/productivity-app build
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/api-server exec tsx src/focus.smoke.ts
```

## Current boundary

This is an initial Phase 1 implementation, not the completed challenge application. Includes Google OAuth routes, persistent sessions, project creation, task creation/edit/completion/deletion, filtering, search, deadline inputs, optimistic version checks, and a responsive dashboard.

Remaining Phase 1 work before its acceptance gate: project rename/delete and task moves, generated OpenAPI contracts, stricter input/date validation, timezone settings, authenticated two-account integration coverage, and browser QA. Google sign-in needs live credentials and callback registration for end-to-end verification. No anonymous demo account is substituted.

The execution/AI phases (AI extraction, stored execution events, SSE and subway replay) remain deferred. See the interactive city delivery section below for the implemented 3D phase.

## Initialization troubleshooting

`GET /api/auth/me` must return HTTP 200 JSON with `user: null` and `configured: true` before an unauthenticated visitor can sign in. `configured: false` means the running API process lacks valid Google configuration; adding secrets to another environment or leaving an old workflow running does not update that process. Stop and restart both Replit workflows after setting secrets. `SESSION_SECRET` does not substitute for the Google settings; this implementation uses random opaque sessions hashed in PostgreSQL.

An empty HTTP 500 response from Vite previously indicated that its proxy could not reach the API on port 8080. The proxy now returns JSON 503, and the client displays a bounded connection failure with Retry rather than leaving authentication loading indefinitely. Vite development and preview both forward `/api` to IPv4 loopback port 8080. Production retains Replit's `/api` service route.

The API development command applies the versioned migration before starting. Production must run `node lib/db/scripts/migrate.mjs` before starting the API; startup checks migration readiness and fails clearly if the database is unavailable. Database connections and queries have bounded timeouts. Startup logs show only whether required settings are present.

Run integration coverage with `pnpm --filter @workspace/api-server test`. It creates two isolated database users/sessions/projects, tests authentication and persistent task CRUD plus cross-user isolation, and removes its fixtures. OAuth redirect construction is tested without making external Google calls. Real Google consent must be tested manually with registered credentials and callback URLs.

## Interactive city delivery

The interactive city phase is now implemented. Authenticated users start in City View and can switch to List View at any time. All buildings derive from the current user's persisted tasks. Neighborhood colors, procedural tower styles, priority height/antenna markers, construction framing, finished lighting, selection, and completion pulses are generated locally. Click a building or use the keyboard-accessible task selector to inspect description, deadline, priority and status, complete/reopen a task, or jump to its editor. Existing list controls remain available below the city. No execution diagram, fake processing events or AI extraction is included.

Migration `0002_city_slots` adds persistent neighborhood and task slots plus atomic allocation counters. Existing records are backfilled once. Subsequent renames, priority/status changes, refreshes and deletions do not reshuffle existing buildings. Large projects expand into additional nonoverlapping blocks after 256 slots. The migration is applied in this workspace; apply it in each deployment database using the existing migration command before starting the new server.

The city uses shared, instanced geometry batches for bodies, cylindrical towers, window panels and construction details. Rendering runs on demand, with bounded pixel ratio, memoized geometry generation and a lazy-loaded 3D bundle. Reduced motion disables completion pulses and animated camera transitions. Missing WebGL2, context loss, and scene failures show a usable List View fallback. Desktop/midrange hardware frame-rate profiling remains to be performed: automated Chromium here uses software rendering, not representative laptop GPU performance. The lazy 3D chunk is roughly 988 kB uncompressed (265 kB gzip), and Vite reports a chunk-size advisory.

Additional checks:

```
pnpm --filter @workspace/productivity-app test
pnpm --filter @workspace/api-server test
```

The layout checks cover stable placement and unique lots across district expansion. API integration checks now re-read saved task edits and completion state and ensure deleted slots are not reused. Tests create only isolated fixtures and clean them up.

For browser regression checks, start the normal frontend/API workflows and a separate headless Chromium with remote debugging on port 9222, then run:

```
node lib/db/scripts/city-browser.mjs
```

The harness targets the existing frontend on localhost:21644. It creates a temporary authenticated workspace with 18 saved tasks, exercises real 3D building clicks, keyboard selection, inspector/editor navigation, view switching, mobile overflow, real WebGL context loss and empty-city rendering, then deletes all fixtures. It does not exercise Google consent or alter production authentication. Desktop/mobile test screenshots are written to `/tmp/focus-city-desktop.png` and `/tmp/focus-city-mobile.png`.

## Miniature-city visual redesign

The former fixed 88-unit platforms and fixed camera offset have been replaced. A neighborhood now gets a compact floating street block with one decorative lot around occupied lots. It expands with task positions and contracts after deletions while preserving the saved coordinates of every task. Neighboring scenery contains no synthetic task buildings: parks, plazas/fountains, trees, benches, streetlights, parked cars, lane markings, crossings, sidewalks and curbs are noninteractive scenery.

The default camera fits actual neighborhood bounds in both viewport dimensions. Single-building selection uses a closer framing; neighborhood badges provide smooth camera tours. Panning stays within the active neighborhood and zoom distance is bounded relative to its size. Only the focused neighborhood is rendered, keeping distant projects from shrinking the initial composition. Editing task status or text does not reset a manually adjusted camera.

Four procedural archetypes provide rounded towers, stepped crowns, rooftop terraces/solar panels and pitched/pyramidal roof silhouettes. Facades include recessed windows, floor cornices, corner trim, entrance canopies, rooftop equipment and warm lighting. Construction rails and a roof hoist distinguish incomplete tasks; completion illuminates windows and adds the existing completion pulse. Task priority still determines height and roof accents. Database slot allocation, authentication and persistence are unchanged.

Lighting uses warm/cool key and fill lights, cached soft shadows, a locally generated reflection environment, a blue dusk background and atmospheric depth. Desktop bloom is restrained and rendered only on demand; small viewports use the direct renderer. Geometry is shared and instanced; only main building shells use rounded geometry, while small details use inexpensive boxes. Unchanged scenery is cached across task-status updates.

Camera tests cover zero, one, five and twenty tasks on desktop and mobile, including a sparse neighborhood after deletions. Browser tests can now be run with `CITY_TEST_COUNT=0`, `1`, `5` or `20` before the existing `node lib/db/scripts/city-browser.mjs` command. They also check neighborhood switching, real building selection, editor navigation and WebGL context-loss fallback. Overview screenshots are saved to `/tmp/focus-city-COUNT-overview.png`. Browser testing uses isolated temporary database fixtures and software-rendered Chromium; representative physical-device GPU profiling remains a manual verification step.
