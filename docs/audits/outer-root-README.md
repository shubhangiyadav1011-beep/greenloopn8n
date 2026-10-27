> Historical notice: This document describes GreenLoop's previous nested project layout and is retained for migration history. Its paths and setup instructions do not describe the current project structure.

# GreenLoop

GreenLoop is a circular construction-material recovery application. The active application lives in `ui/free-react-tailwind-admin-dashboard`; it contains the React and TypeScript frontend, the Node API, SQLite persistence, and the application documentation.

## Repository layout

- `ui/free-react-tailwind-admin-dashboard/` — canonical application Git repository.
- `ui/greenloop-*` — local Git worktrees at earlier GreenLoop checkpoints. They are retained for reference and are not separate active applications.
- `public/photo-check.html` — local image preview page.
- `.freebuff/` — project metadata.

The application is linked as a Git submodule. When cloning this repository, initialize it with:

```powershell
git clone --recurse-submodules <repository-url>
```

If the parent repository was cloned without submodules, run `git submodule update --init --recursive` from its root.

## Prerequisites and setup

- Node.js 24 or newer
- npm

In PowerShell, install the locked dependencies and configure the optional integrations:

```powershell
Set-Location ui/free-react-tailwind-admin-dashboard
npm.cmd ci
Copy-Item .env.example .env
```

Edit `.env` only if you need Google sign-in or an email delivery webhook. The app starts without these integrations in local development. Do not commit `.env` or put real credentials in `.env.example`.

## Run the application

From `ui/free-react-tailwind-admin-dashboard`:

```powershell
npm.cmd run dev
```

This runs Vite on `http://localhost:5173` and the API on `http://localhost:3001`. The API creates and maintains its SQLite database under the ignored `server/data/` directory. Keep that directory on persistent storage and back it up using SQLite-aware backup tools; do not remove active database or WAL files.

## Build and checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run check:backend
npm.cmd run test:backend
```

For a production deployment, build with `npm.cmd run build`, set `NODE_ENV=production`, configure an HTTPS `PUBLIC_ORIGIN`, and run `npm.cmd start` behind a reverse proxy. Keep `server/data/` on persistent storage. See the application’s `README.md` and `BACKEND.md` for workflows, integrations, storage, and deployment details.
