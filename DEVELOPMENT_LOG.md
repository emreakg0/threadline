# Focus City development log

## Reconstructed history (dates unknown)

Git 133c0f1 created the initial repository; 3f10439 initialized the productivity starter and refactored API configuration. Uncommitted work subsequently added Google OAuth, PostgreSQL sessions and migrations, task CRUD, project creation, dashboard, stable city slots, procedural R3F city, compact scenery, architecture, lighting and camera tests. Evidence: source, Git working tree and FOCUS_CITY_SETUP.md. Prior session test claims are historical evidence only, not current verification.

## 2026-11-10 — Recovery audit and persistent memory

- Inspected frontend/backend, OAuth/session handling, migrations, CRUD, procedural city, browser harness, scripts, Git history and pre-existing edits. Preserved all changes.
- Created AGENTS.md, PROJECT_STATUS.md and this log so future sessions can recover architecture, evidence, limits and next steps. Original challenge brief was not found; recovered requirements are identified as provisional.
- Sandbox execution failed before commands started (container bwrap capabilities). Approved execution outside the sandbox enabled local inspection and checks.
- Baseline frontend tests and workspace typecheck passed. Frontend/API builds passed; Vite reported the existing large lazy scene chunk. Started isolated API tests and local software-rendered Chromium verification.
- Next: inspect one-task visuals, repair remaining city issues, verify four task counts and update results.

## 2026-11-10 — Verified visual milestone and continuity checkpoint

- The recovered overhaul already implemented compact neighborhoods, four architecture styles, environmental props, lighting and adaptive framing. Independent browser checks confirmed actual rendering and interaction rather than relying on source presence.
- Fixed camera bounds in src/city/composition.ts to include the platform underside/outer rim, empty-city lamp height and high-priority rooftop accents. Extended layout.test.ts to check actual generated vertical extents and frusta from narrow portrait through ultrawide.
- Tuned CityScene.tsx ambient, hemisphere, warm key and teal fill intensity after inspecting a washed-out one-task screenshot. Preserved on-demand instancing, cached shadows and mobile direct rendering.
- Fixed scenery.ts parked-car color selection: seed modulo 4 always selected the same branch of seed modulo 2; using a higher bit restores both intended colors.
- Replaced stale starter README with actual architecture, startup and checks. Finalized project status and next task. No authentication, database schema or user data changes were needed.
- Verification: workspace typecheck PASS; frontend regression tests PASS; frontend build PASS (988.28 kB scene / 265.33 kB gzip, existing size advisory); backend build PASS. Isolated API integration PASS for persistent task CRUD, ownership isolation, optimistic conflicts, stable/monotonic slots, auth initialization, Google redirect/state, logout and response parsing.
- Chromium software-rendered checks PASS with 0, 1, 5 and 20 real persisted fixture tasks, desktop and mobile: rendering, clicks/inspector/editor when populated, neighborhood and view switching, overflow, WebGL context loss, empty city, no runtime exceptions. Fixtures cleaned by harness. Inspected overview/mobile screenshots, including the attractive one-task composition. Full Google consent and representative physical GPU profiling remain unverified.
- Auth smoke checks also PASS for anonymous access, invalid sessions, request origin protection and invalid OAuth state. Removed a pre-existing trailing blank line from the API entry point to pass patch hygiene checks.
- Local checkpoint preserves all recovered implementation files and these verified changes; staged file-name and credential-pattern checks passed and no secret/environment files are included. Original uncommitted provenance is recorded above. No publishing or deployment performed.
- Next unfinished implementation: ownership-scoped project rename endpoint/UI and integration coverage, then project deletion/task moves. The original Handshake brief must be supplied before claiming complete challenge acceptance.
