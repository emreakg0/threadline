# Threat Model

## Project Overview

Threadline is a productivity application built as a pnpm workspace with three
artifacts:

- **api-server** (`artifacts/api-server`) — Node.js/Express 5 API under `/api`,
  backed by PostgreSQL via `@workspace/db`. It owns authentication, documents,
  knowledge-block review, action plans, action threads, and AI extraction runs
  (Google Gemini).
- **productivity-app** (`artifacts/productivity-app`) — React + TypeScript + Vite
  SPA served statically in production; it talks to the API with same-origin
  cookies.
- **mockup-sandbox** (`artifacts/mockup-sandbox`) — a design/Canvas artifact.
  It declares only a `development` service (no `production` block) and is served
  on `/__mockup`, so it is **dev-only** and not production-reachable.

Authentication is Google OAuth 2.0 (Authorization Code + PKCE). Sessions are
opaque random tokens stored as SHA-256 hashes in `focus_sessions`. The app is a
single-tenant-per-user model: every row carries a `user_id` and all data access
is scoped to the authenticated user.

## Assets

- **User sessions & OAuth state** — `focus_session` cookie (random, hashed
  server-side), OAuth `state`/PKCE verifier cookies. Compromise → account access.
- **User content** — documents, source revisions, knowledge blocks, action
  plans, action threads, tasks, projects. Private per user.
- **AI provider credentials** — `GEMINI_API_KEY` / production Gemini key, gated
  behind operator-only environment flags and a private `.local` approval file.
- **Application secrets** — `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, session
  hashing is keyless SHA-256 over 256-bit random tokens.

## Trust Boundaries

- **Browser → API** — all requests cross here. `requireSession` authenticates via
  the hashed session cookie; non-GET requests additionally require an `Origin`
  header matching `APP_ORIGIN` (CSRF defense, complemented by `SameSite=Lax`).
- **API → PostgreSQL** — all queries are parameterized; every data query filters
  by `user_id` (tenant isolation).
- **API → Google (OAuth + Gemini)** — fixed, hardcoded endpoints with
  `redirect: "error"`; no user-controlled URLs (no SSRF surface).
- **Public vs authenticated** — `/api/healthz`, `/api/readyz`, `/api/auth/*` are
  public; everything else sits behind `requireSession`.
- **Operator vs user** — live/production AI is enabled only by operator-set env
  vars and a root-owned private approval file; no request can change the cohort,
  key, or limits.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts`,
  `artifacts/api-server/src/routes/focus.ts` (auth + mounts),
  `routes/{documents,review,extractions,plans,action-threads}.ts`.
- Highest-risk logic: AI gating/billing in `src/extraction/{gemini,production,
  beta,quota,service,claims,lifecycle}.ts` and
  `src/action-thread/{store,progress}.ts`.
- Auth core: `requireSession`, OAuth callback, and cookie helpers in
  `routes/focus.ts`.
- Dev-only / ignore unless proven reachable: `artifacts/mockup-sandbox/**`,
  all `*.test.ts` / `*.integration.ts` / `*.smoke.ts` files (the only
  string-interpolated SQL lives here, over hardcoded schema names), and
  `mock`-mode AI paths (injected only by the offline test harness).

## Threat Categories

### Spoofing

Sessions are 256-bit random tokens, stored hashed, with 7-day expiry and
server-side validation on every protected request. OAuth uses `state` bound to a
cookie plus PKCE S256; the `state` is single-use (deleted on callback) and
rate-limited. Required guarantee: all protected endpoints MUST validate the
hashed session server-side — currently upheld by `requireSession`.

### Tampering / CSRF

Cookies are `HttpOnly; SameSite=Lax; Secure` (Secure in HTTPS origins). Mutating
requests require a matching `Origin` header. Optimistic concurrency (`version`
columns) and advisory locks protect against race conditions. Required guarantee:
state-changing requests MUST be origin-checked and MUST NOT accept client-set
ownership fields — upheld (all inserts/updates derive `user_id` from the session).

### Information Disclosure

Every read/list query filters by `res.locals.userId`; nested resources
(revisions, blocks, evidence, runs, threads) are re-scoped by `user_id`. The
`publicRun` projection strips server-only fields (lease tokens, grant IDs,
dispatch timestamps). Error handler returns generic messages; logger redacts
`authorization`, `cookie`, and `set-cookie`. Gemini responses are never echoed in
errors. No secrets are shipped to the client bundle.

### Elevation of Privilege

No role system beyond per-user ownership; AI live/production access is gated by
operator-only env/file controls validated by key fingerprint and subject cohort.
Required guarantee: object-level authorization MUST bind subject+object+action —
upheld via `WHERE id=$1 AND user_id=$2` on every object access.

### Denial of Service

JSON body limits (413 handling), statement/lock timeouts (`SET LOCAL
lock_timeout/statement_timeout`), per-user and per-project AI quotas, queue
caps, request spacing, OAuth-state table cap with 429 backpressure, and bounded
provider-response reads (256 KB) mitigate resource exhaustion.
