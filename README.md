# Threadline

Threadline turns a brain dump into a workspace for notes, plans, and tasks. Save a draft, build an action plan by hand, or review AI suggestions when the optional integration is enabled. How It Works replays recorded processing steps, including errors and recovery. The anonymous demo at `/demo` shows two offline runs using synthetic input and a mock provider.

Google sign-in opens a private workspace. Account data, execution history, and AI actions belong to the signed-in account. Read the [release checklist](RELEASE.md) before running a public instance.

## Local setup

1. Install Node.js 24, pnpm 10.26.1, and PostgreSQL. Run `pnpm install --frozen-lockfile` at the repository root.
2. Create a local database and export the variables listed in [.env.example](.env.example). The app reads process environment variables. Store real settings in a shell secret manager or a Git-ignored environment file.
3. Set `APP_ORIGIN` to the actual frontend origin, typically `http://localhost:5173` for Vite. To enable sign-in, use local Google Web application credentials and register `http://localhost:5173/api/auth/google/callback` for that origin.
4. Apply migrations with `node lib/db/scripts/migrate.mjs`. Run the API and frontend from separate terminals.

```sh
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/productivity-app dev
```

Vite sends API requests to port 8080. The demo and policy pages also work without Google credentials. The default install leaves Gemini disabled.

## Verification

```sh
pnpm typecheck
pnpm --filter @workspace/productivity-app test
pnpm --filter @workspace/productivity-app test:security
pnpm --filter @workspace/api-server test
pnpm build:release
node lib/db/scripts/release-smoke.mjs
```

Use a disposable PostgreSQL database for integration and browser tests. The release smoke test uses the local production bundle and upgrades an isolated schema. The [capture browser harness](lib/db/scripts/capture-browser.mjs) needs the Vite dev server on loopback port 21646, Chromium with CDP on loopback port 9222, and PostgreSQL. All automated provider tests use offline fixtures or intercepted transport. See [RELEASE.md](RELEASE.md) for the HTTPS deployment preflight and manual two-account acceptance.

## Project layout

- `artifacts/productivity-app` contains the React workspace and public pages.
- `artifacts/api-server` contains the Express API, OAuth session handling, and extraction worker.
- `lib/db` contains PostgreSQL setup, migrations, and browser test scripts.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution checks and [SECURITY.md](SECURITY.md) for private reporting. [LICENSE-PROPOSAL.md](LICENSE-PROPOSAL.md) describes the proposed MIT release and the approvals still required.
