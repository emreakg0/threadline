# Focus City project status

Last inspection: 2026-11-10 (UTC). Recovery and visual verification completed for the current visual milestone.

## Version control and backup

GitHub destination: https://github.com/emreakg0/focus-city (private, owner emreakg0), connected as origin; existing gitsafe-backup retained. Existing history and recovery checkpoint 1a3834e are preserved. Source includes actual frontend/backend, SQL migrations, tests and memory documentation. Initial push succeeded on 2026-11-10: local commit b0fab19c19f4307dfc73d9f5a54df8b1fb2e2d9a matched GitHub refs/heads/main exactly. main tracks origin/main; privacy and clean working tree were confirmed. A follow-up documentation commit records this confirmation. Local Git uses GitHub CLI as its GitHub credential helper without embedding tokens in URLs or files in the repository.

Future completed, verified milestones must update memory, pass applicable checks and credential review, receive meaningful commits and push automatically to the private origin. Never force-push, delete the repository, change visibility or deploy without explicit permission. GITHUB_BACKUP.md documents recovery and verification. scripts/secret-audit.py scans all reachable history and tracked files; the initial audit found zero credential matches in 163 historical blobs. .gitignore additionally excludes OAuth downloads, token files, local GitHub/AWS/SSH configuration and data exports. Live database contents and runtime secrets are not backed up by Git.

## Overview and architecture

Private productivity workspace: Google sign-in, persisted projects/tasks and a miniature city derived from real tasks. React/TypeScript/Vite/Tailwind frontend lives in artifacts/productivity-app; Express backend in artifacts/api-server. PostgreSQL uses pg with namespaced SQL migrations in lib/db/migrations. OAuth state/session tokens are hashed in the database; browser cookies are HttpOnly, SameSite=Lax and Secure with HTTPS origin. API queries scope ownership to authenticated users; edits use optimistic versions.

App.tsx owns list/city switching, forms, filtering, search and API state. CityView loads CityScene lazily. layout.ts maps persistent slots to stable coordinates; composition.ts fits neighborhoods/camera; scenery.ts generates instanced props and four building archetypes. CityScene provides orbit controls, lighting, reflections, cached shadows, desktop bloom and context-loss fallback. Only the focused neighborhood renders. Slots expand into further blocks after 256 tasks.

## Recovered state

HEAD was 3f10439, preceded by 133c0f1 (starter commits). The entire Focus City implementation and overhaul were uncommitted when recovered. Existing edits include Replit configuration, backend/frontend, DB wiring and lockfile; untracked source includes city, API routes/tests, migrations and setup notes. None was discarded. README was stale starter documentation.

## Visual overhaul assessment

1. Adaptive framing: implemented; 0/1/5/20 desktop/mobile mathematical frustum tests pass. Independent Chromium checks and screenshots verified for 0/1/5/20 tasks.
2. Compact expandable neighborhoods: implemented with roads, curbs, crossings, trees, parks, fountain plazas, benches, lamps and cars. Deterministic scenery and stable layout tests pass.
3. Architecture: four silhouettes, facade details, windows, crowns, rooftop equipment/solar panels and construction details implemented. Real-task mapping tests pass.
4. Night/dusk lighting: warm windows, teal accents, hemisphere/key/fill lights, fog, stars, reflection environment, cached soft shadows and restrained desktop bloom implemented. Desktop/mobile screenshots inspected; lighting tuned to reduce washed-out surfaces.
5. Miniature aesthetic: implemented in source; independent desktop/mobile visual inspection completed.
6. Actual task/project integration: implemented; isolated two-account API integration tests pass. Google consent requires manual external verification.
7. Performance: instancing, memoization, demand rendering, bounded DPR, lazy loading and mobile bloom exclusion implemented. Physical-device frame rate/memory profiling incomplete. Large sparse multi-block neighborhoods may still frame too widely.
8. Camera scenarios: numerical tests pass; all four independent browser scenario reruns pass.

## Functionality and remaining requirements

Task create/read/update/delete, status/priority/deadline, search/filter, list/city navigation and selection exist. Projects support create/read only: rename/delete and task moves are missing. Database migrations and isolated two-account integration tests exist. Google redirect/state tests do not verify real consent.

The original Handshake challenge specification is absent from the inspected repository. From FOCUS_CITY_SETUP.md, remaining requirements are project rename/delete, task moves, generated OpenAPI contracts, stronger input/date validation, timezone settings, live OAuth/browser acceptance and deferred AI extraction, stored execution events, SSE and subway replay. This is a recovered list, not independently verified challenge completeness; obtain the original brief before claiming acceptance.

Known debt: health-only generated contracts; dense procedural code; large lazy 3D chunk (988.28 kB / 265.33 kB gzip); no physical GPU profiling; full OAuth consent not independently verified. Invalid dates can reach database errors. Do not change authentication/security as part of visual work.

## Active phase and next task

2026-11-10 exposure review completed: repository is private with only its owner listed, no hooks/Pages; no credential matches found in tracked history or generated frontend assets. Patched dependency audit reports zero known vulnerabilities. Explicit Vite hosts, restricted file serving, API no-cache/security headers and fail-closed write-origin checks are implemented and regression-tested. See SECURITY_REVIEW.md for scope, tests and remaining production hardening; this does not certify the application free of all vulnerabilities. No deployment or GitHub access-setting changes.

Current visual milestone is verified. Camera framing now includes the floating platform underside, outer rim, empty-city lamps and tallest rooftop accents. Lighting is less washed out; parked cars now use both intended colors. The prior overhaul was substantially implemented before recovery; this session verified it and repaired these remaining details.

Exact next implementation task: add project rename with ownership-scoped PATCH /api/projects/:id, validated names, sidebar editing and two-account integration coverage. Project deletion and task moves should follow with explicit data-preservation semantics. Before claiming final visual performance acceptance, profile a representative physical mobile device/laptop and test live Google consent with the registered account.

## Verification

2026-11-10: frontend layout/camera/scenery tests PASS; workspace typecheck PASS; frontend build PASS with chunk-size advisory; backend build PASS. API integration PASS (persistence, task CRUD, isolation, conflicts, OAuth redirect/state and logout). Chromium browser scenarios PASS for 0/1/5/20 tasks, including real building clicks when populated, task inspector/editor, neighborhood/view switching, 390px mobile overflow, context-loss fallback, empty state and no browser exceptions. Desktop overview and mobile screenshots inspected. Regression tests additionally verify platform/rooftop vertical extents and portrait-to-ultrawide frusta. No deployment authorized or performed.

Browser reproduction: existing frontend at http://127.0.0.1:21644 and API on 8080; launch Chromium with `chromium --headless --no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9222 --user-data-dir=/tmp/focus-city-recovery-chromium about:blank`, then run `CITY_TEST_COUNT=N node lib/db/scripts/city-browser.mjs` for N=0,1,5,20. This uses software rendering and isolated fixtures. Screenshots are ephemeral `/tmp/focus-city-N-overview.png` and `/tmp/focus-city-N-mobile.png`; regenerate in future sessions. No production authentication was bypassed or changed. Local checkpoint commit records recovered source plus verified refinements; see Git history for its ID.
