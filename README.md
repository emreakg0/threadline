# Productivity App Starter

A minimal full-stack development scaffold. No application features, authentication,
database connection, or external API integrations are implemented.

## Stack

- React + TypeScript + Vite
- Tailwind CSS 4 (Vite plugin)
- Node.js + Express 5 + TypeScript
- pnpm workspaces

## Requirements

- Node.js 24
- pnpm 10

## Install

```sh
pnpm install --frozen-lockfile
```

Commit `pnpm-lock.yaml` along with the source so installs remain reproducible.
No secrets or database configuration are required.

## Develop in Replit

Run the **Productivity App** and **API Server** workflows. Replit supplies each
service's `PORT` and routes the homepage at `/` and the backend at `/api`.
Vite provides frontend hot reload; `tsx watch` restarts Express on backend edits.

## Develop outside Replit

Start the services in separate terminals:

```sh
# Frontend: http://localhost:5173
pnpm --filter @workspace/productivity-app dev
```

```sh
# Backend: http://localhost:8080/api/healthz
pnpm --filter @workspace/api-server dev
```

The ports default to 5173 and 8080 respectively and can be overridden with `PORT`.
The frontend's `BASE_PATH` defaults to `/`.
There are no frontend API calls yet. In Replit, future API calls can use
same-origin `/api/...` URLs; outside Replit, configure your own reverse proxy or
Vite development proxy when adding those calls.

## Structure

```text
artifacts/
  productivity-app/     # React frontend
    src/App.tsx         # Placeholder homepage; start editing here
    src/index.css       # Tailwind entry point
    src/main.tsx        # React entry point
    vite.config.ts      # Vite + Tailwind development configuration
  api-server/           # Express backend
    src/app.ts          # Express middleware and router
    src/index.ts        # Server entry point
    src/routes/         # Only the starter health endpoint
lib/                    # Template-provided optional shared libraries
scripts/                # Workspace utility scripts
```

The pre-existing `lib/db` package is unused; the app does not connect to a
database. `lib/api-spec` and related generated packages describe the existing
health endpoint. `artifacts/mockup-sandbox` is template tooling, not application
code, and is not needed to run this starter.

## Checks and builds

```sh
pnpm typecheck
pnpm --filter @workspace/productivity-app build
pnpm --filter @workspace/api-server build
```

Frontend output is `artifacts/productivity-app/dist/public`. Backend output is
`artifacts/api-server/dist`; run it with
`pnpm --filter @workspace/api-server start`.

## GitHub

This is a standard pnpm repository with no GitHub integration required.
Dependencies, build output, logs, and local `.env` files are ignored by Git.
Do not commit secrets. Replit's service metadata is retained so the project also
runs in Replit.
