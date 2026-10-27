# GreenLoop backend

The backend is a native Node.js HTTP API supporting Supabase PostgreSQL with private Storage, and SQLite as an explicit fallback. It owns authentication, authorization, trusted validation, workflow actions, and transactional capacity enforcement. The public landing page remains illustrative; authenticated operational records come from the API. See the [Supabase migration guide](../docs/SUPABASE_MIGRATION.md) for the relational model, dashboard setup, environment, import, tests, deployment and rollback.

`src/server.mjs` binds the configured port. `src/app.mjs` constructs the API and serves the production frontend. `src/database/openDatabase.mjs` opens the existing SQLite store, `src/validation.mjs` contains request/security validation helpers, and `src/actions.ts` applies workflow actions through the shared domain engine. Tests use isolated temporary databases.

## Run locally

Use Node 24 or newer. From the workspace root, install dependencies with `npm.cmd ci`, then run:

```powershell
npm.cmd run dev
```

The root command starts the frontend at http://localhost:5173 and the API at http://localhost:3001. Vite forwards `/api` requests to the backend. Both processes stop together; changes to backend modules restart the API. To start only this service, use `npm.cmd run dev:backend` from the workspace root.

Create a new account, complete onboarding, and choose provider, receiver, or both. Existing browser demo accounts are not migrated. Each receiver gets its own facility; workspaces start without demo records. To exercise the full workflow, use two accounts in separate browser profiles:

1. Receiver: create a dated concrete capacity slot and publish a material request for that date.
2. Provider: create a project and Material Passport, upload evidence, then offer material against the request or request capacity directly.
3. Receiver: accept the offer or booking request. An accepted offer attaches the demand to a booking; requests exceeding capacity remain on hold.
4. Provider: dispatch the accepted, confirmed booking.
5. Receiver: record the arrival weight, then accept or reject the measured quantity. Accepted plus rejected quantities must equal the measured weight; rejection requires a reason.
6. Provider: view the verification and reports. Both accounts refresh shared data every five seconds and when the window regains focus.

## SQLite fallback storage and transaction model

`server/data/greenloop.sqlite` stores users, password hashes, sessions, reset tokens, OAuth state, ownership, evidence bytes, and the shared operational dataset. This existing path is retained for data compatibility and is ignored by Git. Back up the database with SQLite's backup facilities or while the server is stopped; WAL files are part of an active database and must not be discarded.

The dataset is stored as one JSON document to reuse the existing domain engine. Each business action obtains a SQLite `BEGIN IMMEDIATE` transaction, loads current state, checks ownership and inputs, applies the action, and commits state plus related ownership changes together. Concurrent requests therefore cannot reserve the same capacity twice. Cancellation rechecks held bookings in order. The server is authoritative; clients cannot submit an entire replacement dataset or reset the shared database.

Accounts currently represent one organization each. Only the account that created a project can change its materials; only a facility owner can manage its slots and decide its offers, arrivals, and verifications. Providers can see receiver capacity and demand. Receivers see passports and evidence attached to their incoming offers and bookings. The server filters operational records by the active workspace and only returns public reservation totals for other providers.

Passwords use salted scrypt hashes; sessions use random tokens in HttpOnly, SameSite cookies, with hashed tokens and expirations in SQLite. Mutation requests require a custom header and an allowed Origin. Recovery uses expiring, single-use tokens and revokes sessions after a password reset. Authentication requests have a per-address rate limit.

PNG, JPEG, WebP, and PDF evidence uploads have a 4 MB file limit and a 100 MB account limit. File signatures are checked. Evidence is served through authenticated API URLs rather than publicly exposed storage paths. Documents attached to passports have download links.

## Integrations

Copy `.env.example` to `.env` to configure services; do not commit `.env`.

Google sign-in uses a server-side authorization code exchange with state validation and PKCE. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PUBLIC_ORIGIN`; register `${PUBLIC_ORIGIN}/api/auth/google/callback` as the Google web application's authorized redirect URI. The button is disabled until configured. Google subjects are stored separately, and an existing password account is never silently linked by email. See [Google's OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

For recovery email, configure `EMAIL_WEBHOOK_URL` and optionally `EMAIL_WEBHOOK_TOKEN`. The server sends `{ to, subject, text }` to this webhook, with an optional Bearer token. Connect it to your email delivery service. In development without a webhook, recovery messages are written to `server/data/mail-outbox.jsonl`; open the link in the latest message to complete a reset. Reset tokens are not returned by the public API. Production password recovery returns an explicit configuration error until email delivery is configured.

## Deployment and checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run check:backend
npm.cmd run test:backend
npm.cmd start
```

`npm start` serves the built website and API together. For deployment, set `NODE_ENV=production`, configure an HTTPS `PUBLIC_ORIGIN`, and use a reverse proxy that forwards requests to `HOST:PORT`. Secure session cookies require HTTPS. Keep `server/data` on persistent storage. Do not use `vite preview` for the integrated website; it does not provide the backend.

The backend integration test covers registration, incorrect credentials, ownership enforcement, uploads, concurrent reservation limits, cancellation and hold promotion, booking acceptance, dispatch, receiving and verification, demand offers, private support requests, persistence after restart, password recovery, token reuse, session revocation, and disallowed origins. It runs against a temporary database and removes only that test directory.

This implementation supports the existing workflows, but external email delivery and Google login require your credentials and have not been exercised against live providers. Route distances are unmeasured for new facilities and shown as unknown; cost figures remain indicative, and the illustrated map is not live vehicle tracking. Matching uses actual demand and available capacity alongside material suitability. Browser automation was unavailable during implementation, so visual and click-through QA still needs a browser. For a larger deployment, normalize the dataset into relational tables, add organization membership and account verification, and configure monitoring and backups.
