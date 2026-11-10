# Focus City

A private task workspace where real tasks become a miniature 3D city and projects become neighborhoods.

Start each development session by reading [AGENTS.md](AGENTS.md), [PROJECT_STATUS.md](PROJECT_STATUS.md) and [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md). Configuration and OAuth setup are in [FOCUS_CITY_SETUP.md](FOCUS_CITY_SETUP.md). Never commit local environment files.

Private source backup: [emreakg0/focus-city](https://github.com/emreakg0/focus-city). See [GITHUB_BACKUP.md](GITHUB_BACKUP.md) for milestone pushes, credential checks and recovery; database contents and runtime secrets are excluded.

## Architecture

- `artifacts/productivity-app`: React, TypeScript, Vite and Tailwind dashboard; lazy React Three Fiber / Three.js city in `src/city`.
- `artifacts/api-server`: Express API; Google OAuth, hashed PostgreSQL sessions, ownership-scoped projects and task CRUD.
- `lib/db`: PostgreSQL pool, additive migrations and isolated browser QA harness. Persistent slots keep buildings stable across edits and refreshes.
- `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`: starter health contracts; task/auth contract generation remains unfinished.
- `artifacts/mockup-sandbox`: template tooling.

## Local development

Use Node.js 24 and pnpm 10. Install with `pnpm install --frozen-lockfile`. Configure DATABASE_URL, APP_ORIGIN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET privately as described in the setup guide. Apply migrations with `node lib/db/scripts/migrate.mjs`.

Run the services in separate terminals:

```sh
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/productivity-app dev
```

Frontend defaults to http://localhost:5173 and proxies `/api` to port 8080. Existing Replit workflows use their assigned frontend port. Google callback registration must match APP_ORIGIN exactly. No anonymous demo data replaces authentication.

## Verification

```sh
pnpm typecheck
pnpm --filter @workspace/productivity-app test
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/productivity-app build
pnpm --filter @workspace/api-server build
```

API tests require a migrated database and clean up only their own fixtures. See the setup guide and status file for browser camera checks and remaining acceptance work. Build output goes to `artifacts/productivity-app/dist/public` and `artifacts/api-server/dist`.
