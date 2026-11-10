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

## 2026-11-10 — Private GitHub source backup

- Inspected the clean main branch, existing history and gitsafe-backup remote. GitHub CLI authenticated as emreakg0; no matching Focus City repository existed. Created https://github.com/emreakg0/focus-city as PRIVATE and configured origin without altering history or the existing backup remote.
- Preserved recovery checkpoint 1a3834e and the actual frontend/backend, migrations, tests, lockfile and project documentation. No application rebuild or runtime changes.
- Expanded .gitignore for Google OAuth downloads, tokens, key files, local GitHub/AWS/SSH credentials, database exports and user-data directories. Existing dependency/build/environment exclusions remain. GitHub CLI credential storage is explicitly ignored.
- Added scripts/secret-audit.py: scans all reachable Git blobs and current tracked files for credential patterns and configured sensitive values, reporting locations without values. Initial history audit: 163 blobs and 144 tracked paths, zero findings. Reviewed the tracked file inventory for credential files/data exports. Pattern checks are heuristic, not a guarantee against all sensitive data.
- Verified the audit in an isolated temporary Git repository: clean history passed; synthetic current and historical-only token markers were detected and redacted. Verified representative ignore paths. Frontend camera/layout/scenery tests and workspace typechecks pass. Prior visual milestone browser/API/build verification remains recorded above; application source is unchanged in this milestone.
- Updated AGENTS.md to automatically commit and push completed verified milestones while preserving privacy and forbidding force pushes/repository deletion without permission. Added GITHUB_BACKUP.md recovery/push instructions and updated README.md and PROJECT_STATUS.md. This is a source backup; live PostgreSQL data and runtime secrets require separate authorized backups and are not uploaded.
- Initial push and remote hash verification follow this setup commit. Next development task remains project rename endpoint/UI with ownership isolation coverage; visual-device/OAuth acceptance limitations remain in status.

## 2026-11-10 — Initial GitHub push confirmed

- Pushed main successfully to the private origin and set its upstream to origin/main. The local and GitHub branch hashes both matched b0fab19c19f4307dfc73d9f5a54df8b1fb2e2d9a. GitHub confirmed PRIVATE visibility and main as the default branch; working tree was clean.
- Configured the local repository's GitHub credential helper to use authenticated gh, with no token embedded in the remote URL or project files. Existing gitsafe-backup remains intact.
- Updated PROJECT_STATUS.md and this log with the observed push result; this confirmation is committed and pushed as a follow-up. No deployment, history rewrite or live data upload occurred.

## 2026-11-10 — Repository exposure audit and hardening

- Confirmed GitHub is private, only owner emreakg0 is listed, with no webhooks or Pages. Repeated history/working-tree secret checks (173 historical blobs at start); no matches. No hosting/access settings changed.
- Found known dependency advisories (7 high, 7 moderate, 2 low). Patched pnpm workspace ranges and lockfile for body-parser, qs, undici and fast-uri; upgraded the Zod catalog to patched v4 and aligned lib/api-spec/orval.config.ts. Kept minimum release age and installed with lifecycle scripts disabled. Final registry audit: zero known findings across 498 dependencies; no remaining peer warning.
- Found arbitrary-host Vite configuration and workspace-wide file access. Added scripts/vite-security.ts with explicit environment-derived hosts and credential deny rules; restricted both frontend configurations to their application directory and node_modules. Added security.test.ts and test:security script to exercise actual hostile-host, credential-file and backend-source requests. Initial Host test used fetch, which did not deliver the intended Host override; corrected it to node:http and verified real 403 responses.
- Added API no-store/nosniff/no-referrer/frame-denial headers, removed X-Powered-By, and rejected writes when APP_ORIGIN is missing. Expanded focus.integration.ts with response-header, cross-account PATCH and invalid/missing-origin checks. Existing persistence and ownership behavior preserved.
- Verification: security regression PASS; API integration and auth smoke PASS; workspace typecheck and city layout tests PASS; frontend/API/mockup builds PASS (existing scene chunk advisory). Six built browser assets contain no matched credential patterns or configured sensitive values. Authenticated one-task browser regression PASS after file-boundary restrictions, including selection/editor, neighborhood/view switching, mobile overflow, context-loss fallback and empty state, with no browser exceptions.
- Added SECURITY_REVIEW.md; updated AGENTS.md and PROJECT_STATUS.md with ongoing checks and limitations. Remaining production security work includes rate limits, input/date validation, deployment TLS/access/CSP review and live OAuth consent. Next product task remains project rename with ownership-scoped API/UI tests.

## 2026-11-10 — Verify and repair four Semgrep supply-chain findings

- Inspected package manifests, .npmrc, pnpm lock/workspace, post-merge/Replit workflows and installed Node 24.22.1 / pnpm 10.26.1 / npm 11.19.1 / Semgrep 1.179.0. No npm install or GitHub Actions workflow found. Retained manager/version and dependency graph.
- Retrieved four public rules at revision 16b9e6d45f10649f6a531ec4838ed9924372c3bc and reproduced all four baseline findings. The release-age rule requires seven days: existing 1440 minutes was below threshold, not an absent-setting false positive. npm finding is operationally inapplicable to the supported pnpm workflow but its supported fallback is now hardened. Public rule severity is MEDIUM with impact HIGH; original hosted artifact unavailable (code-scanning endpoint disabled).
- Added supported blockExoticSubdeps/no-downgrade trust settings, raised cooldown to 10080 minutes, removed blanket vendor exclusions, and set npm's supported seven-day fallback. Preserved build allowlist/peer behavior, moved peer config to YAML, pinned packageManager/engines with strict checks. Replaced destructive preinstall lock deletion with scripts/check-package-manager.mjs, which refuses other installers/locks without deleting files.
- Added scripts/test-supply-chain.py and root test:supply-chain command. Temporary local registry tests PASS for young-release rejection, exact-version exception acceptance/nonspillover, trust downgrade rejection, exotic-subdependency rejection and npm fallback enforcement. Initial fixture expected a different error code and lacked HTTP HEAD; corrected the harness and reran successfully. Separate manager-guard fixtures passed, including preservation of a competing lock.
- CI=true frozen install PASS (unchanged lockfile); workspace typecheck, city tests, Vite security tests, two-account API integration and complete production build PASS. Dependency audit: zero known advisories. Semgrep rerun: 4 rules, 0 findings, 0 errors, no suppressions; metrics/version checks off. No dependencies were upgraded/downgraded.
- Added SECURITY_AUDIT.md with fixed/not-applicable findings, primary references, exact-version emergency procedure, source-reviewed pnpm 10 frozen-lock limitations and remaining production risks. Updated README, AGENTS and project status. No secrets exposed, application deployed or user data removed. Next development task remains project rename API/UI with isolation coverage.
