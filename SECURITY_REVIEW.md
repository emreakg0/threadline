# Security exposure review — 2026-11-10

## Verified repository exposure

- GitHub repository remains PRIVATE: https://github.com/emreakg0/focus-city. Only owner emreakg0 appeared in the collaborator list; no repository webhooks or GitHub Pages site were present. No repository visibility/access settings were changed.
- Credential-pattern and configured-secret comparison found no matches in reachable Git history or current tracked files. Ignore rules exclude environment files, Google credential downloads, local authentication configuration, keys/tokens and data exports. File inventory contains application source and isolated test fixtures, not database exports. These are heuristic checks, not proof against every possible secret or sensitive datum.
- Built frontend assets were separately compared against configured sensitive values and credential patterns: all six assets passed. Credentials remain in server environment configuration, not browser source or remote URLs.

## Findings repaired

- Dependency audit initially reported 7 high, 7 moderate and 2 low findings. Updated compatible body-parser, qs, undici and fast-uri ranges and moved the Zod catalog from v3 to patched v4; updated Orval's generation target accordingly. Final pnpm audit: ZERO known advisories across 498 dependencies. The one-day package-release safeguard remains enabled; dependencies were installed without lifecycle scripts.
- Both Vite configurations accepted arbitrary hostnames. Replaced that with exact owned hosts from APP_ORIGIN / Replit configuration while retaining Vite's localhost/IP support. Limited file serving to each frontend and root node_modules; added deny patterns for credentials and local data. This prevents backend source and machine credential access through frontend @fs requests. Vite's documented risk: https://vite.dev/config/server-options.html#server-allowedhosts.
- API responses now send no-store, nosniff, no-referrer and frame-denial headers and omit X-Powered-By. This reduces authenticated response caching and incidental information exposure.
- API write requests now fail closed if the expected application origin is missing. Existing authenticated ownership scoping, parameterized SQL, hashed sessions, OAuth state validation and cookie flags remain intact.

## Verification

- Development-server regression PASS: local page works; hostile Host rejected; credential files blocked through normal and @fs routes; backend source outside frontend boundary rejected.
- API integration and auth smoke PASS, including cross-account read/create/update/delete isolation, invalid/missing write origin, OAuth redirect/state, hashed-session lookup, logout, optimistic versions and response headers.
- Workspace typecheck, city layout tests and frontend/API/mockup builds PASS. Existing 3D chunk-size advisory remains.
- One-task authenticated browser regression PASS after the serving-boundary change: real building selection, editor/view/neighborhood navigation, mobile overflow, context-loss fallback and empty state; no browser exceptions.

## Limits and next security work

This is a scoped source/configuration review, not a penetration test or a guarantee of no vulnerabilities. Advisory results describe the registry at review time. Public development endpoints deliberately expose frontend development code to visitors using the configured hostname; use a protected development environment and serve production build output when deploying. Vite is not an authentication gateway or production server.

Before a production deployment: review host/proxy TLS and access policy, add appropriate request/auth rate limits, strengthen input/date validation, choose/test a production Content-Security-Policy, and complete live Google consent verification. No deployment, paid security service, history rewrite, credential rotation or user-data changes were performed.
