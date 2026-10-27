# GreenLoop

GreenLoop connects construction and demolition material providers with receivers who have suitable capacity. The application includes a public site, provider and receiver workspaces, matching and reservation workflows, booking and delivery tracking, evidence-backed material passports, and load verification.

## Architecture

- `frontend/` — React 19, TypeScript, Vite 8, Tailwind CSS 4, client routing, UI state, and static assets.
- `greenloop-story/` — standalone 13-chapter public site. Development and production builds import its bundled `dist/` into `frontend/public/landing/`, adding account and platform links. After rebuilding the story, run `npm.cmd run import:public-site` to refresh an already running frontend.
- `backend/` — Node 24 HTTP API, authentication, validation, SQLite/Supabase PostgreSQL persistence, workflow actions, and integration tests.
- `shared/domain/` — pure GreenLoop domain types, matching and capacity rules, and metrics used by the frontend and backend.
- `scripts/` — development process runner and HTTP/runtime audit utilities.
- `docs/audits/` — retained baseline audit reports.

Frontend and backend are npm workspaces with one root lockfile. The API uses Node's HTTP module, `pg` for Supabase PostgreSQL, the official Supabase client for private evidence storage, and Node's SQLite module for explicit fallback. Backend responsibilities live in `backend/src/app.mjs` and `backend/src/actions.ts`; `backend/src/server.mjs` handles process startup. See the [Supabase migration guide](./docs/SUPABASE_MIGRATION.md) for schema, setup, import, verification and rollback. The frontend and business workflow remain unchanged.

## Requirements and setup

- Node.js 24 or newer
- npm

From this directory, install the locked workspace dependencies and make a local environment file:

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

The application runs locally without external credentials. Configure Google OAuth or email webhook values in `.env` only if you need those integrations. Never commit `.env` or add credentials to `.env.example`.

### Admin console setup

Create and onboard the initial administrator as a normal GreenLoop account, stop the API, then run `npm.cmd run admin:bootstrap -- user@example.com` from the repository root. This local operator command assigns the first Super Admin role and writes its bootstrap audit entry; public signup and profile updates cannot assign a system role. Restart the API and sign in again. Super Admins can assign Support Admin and Operations Admin roles from `/admin/users`.

## Run locally

```powershell
npm.cmd run dev
```

The combined development command starts Vite at `http://localhost:5173` and the API at `http://localhost:3001`. The default `.env.example` selects SQLite at `server/data/greenloop.sqlite` until Supabase is configured. Set `DATABASE_PROVIDER=postgres` and follow the migration guide to use a shared database and Storage bucket. Back up SQLite using SQLite-aware tools or while the API is stopped; retain it as a fallback.

To run either application separately:

```powershell
npm.cmd run dev:frontend
npm.cmd run dev:backend
```

## Main workflows

Create an account, complete onboarding, and choose provider, receiver, or both workspaces. For an end-to-end exchange, use two accounts in separate browser profiles:

1. A receiver creates capacity and publishes a dated material request.
2. A provider creates a project and material passport, attaches evidence, and offers suitable material.
3. The receiver reviews the offer or booking request. Requests beyond available capacity remain on hold.
4. The provider dispatches a confirmed booking.
5. The receiver records the arrival weight and accepts or rejects the measured quantity. Rejected quantities require a reason.
6. Both parties can review the verification and reports.

## Build and checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run check:backend
npm.cmd run test:backend
```

`npm.cmd start` serves the production frontend and API together. For deployment, set `NODE_ENV=production`, configure an HTTPS `PUBLIC_ORIGIN`, run behind a reverse proxy, and keep `server/data/` on persistent storage. `vite preview` does not provide the API. See [backend documentation](./backend/README.md), the [environment template](./.env.example), and the archived [baseline audit](./docs/audits/architecture-audit-baseline.md).
