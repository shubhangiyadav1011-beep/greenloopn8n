# GreenLoop Supabase migration

The application supports **React → Node API → Supabase PostgreSQL**, with private evidence in Supabase Storage. Configure your project before enabling it. SQLite remains an explicit fallback; the existing database has not been deleted or updated by this migration work.

No frontend source, routes, API request/response shapes, business actions, or shared matching/capacity rules changed. The repository now uses `frontend/`, `backend/`, and `shared/domain/`; the original migration request referred to an earlier layout.

## Architecture, transactions and authentication

Keep the existing Node authentication. Password hashes, hashed cookie sessions, single-use recovery tokens, Google identities, OAuth state/PKCE, onboarding and workspace selection retain their behavior. Accounts are not moved to Supabase Auth.

The existing business engine receives a request-local dataset reconstructed from relational rows. It is never persisted as a JSON document. `AsyncLocalStorage` isolates requests; the adapter supplies the existing synchronous model interfaces so validations and ownership checks remain intact.

Each API request uses one PostgreSQL connection and transaction, obtaining `pg_advisory_xact_lock(7210462194301)` before loading authoritative rows. All backend instances use this lock. Reservations, cancellation, hold promotion, negotiation, dispatch, verification, profile/ownership changes and audit events commit together. Snapshot reads use one database round trip; only changed rows are written. Responses and cookies are sent after COMMIT. Errors roll back; database failures never silently switch to SQLite.

The coarse lock preserves the engine for the hackathon. A deferred SQL trigger also rejects confirmed reservations exceeding a slot's capacity. This limits throughput: larger deployments should use targeted queries and locks per slot instead of loading all records and serializing requests. Google/email/Storage network operations currently hold the request transaction open.

## Schema and changed files

`supabase/migrations/001_initial_schema.sql` creates the private `greenloop` schema:

| Tables/views | Purpose |
| --- | --- |
| `users`, `organizations`, `user_organizations` | Scalar profiles and one organization per account |
| `sessions`, `resets`, `google_identities`, `oauth_states` | Existing Node authentication |
| `projects`, `material_passports` | Projects and surveyed materials |
| `receiver_facilities`, `receiver_capacity`, `receiver_demands` | Facilities, dated intake capacity, requests and drafts |
| `allocations`, `offers`, `offer_counters`, `bookings` | Matches, negotiation and reservations |
| `verifications`, `material_evidence`, `uploads` | Receipts, acceptance/rejection and attachment metadata |
| `audit_events`, `notifications`, `support_requests` | Timelines, notification read markers and private support |
| `dispatches`, `inventory` views | Authoritative booking/verification projections |
| `schema_migrations` | Applied schema version |

Users, organizations and uploads use UUIDs. Operational IDs such as `PR-01`, `BK-1` and `EV-001` remain text primary keys to preserve routes, links and the engine. Foreign keys, uniqueness, indexes, statuses and quantity checks enforce integrity. Workflow records use restricted deletion; cascades apply narrowly to child evidence, counters and authentication records.

JSONB is limited to coordinates, estimate ranges, ranked matching explanations and event actors. Evidence and negotiation counters have child rows. There is no whole-state or whole-entity JSON payload. Array positions preserve FIFO hold promotion and timelines. Date-only values retain their API strings; timestamps use `timestamptz` and return ISO strings. Inventory/dispatch views avoid duplicate mutable stock/load records. Unread notifications remain derived from visible audit events; read markers are relational.

Changed/added files:

- `backend/src/database/postgres.mjs`: verified TLS pool, official Supabase Storage client, transactions and cleanup.
- `backend/src/database/relational.mjs`, `snapshotModels.mjs`: mapping and request-local model facade.
- `backend/src/app.mjs`, `server.mjs`: database selection and startup readiness check.
- `backend/src/controllers/bufferedResponse.mjs`, upload/system controllers: commit-before-response and protected downloads.
- `backend/scripts/migrate-postgres.mjs`, `migrate-sqlite.mjs`: SQL setup and read-only SQLite import.
- Backend tests, harness and PostgreSQL test runner: isolated regression/migration coverage.
- Root/backend manifests and root lockfile: commands, `pg`, official Supabase client and development-only PGlite.
- `.env.example`, root/backend READMEs and this guide: configuration and operating instructions.

## Security and uploads

`SUPABASE_DB_URL` is a backend-only PostgreSQL connection string. The service role key is used only by the Node Storage client. Neither secret reaches the frontend, which continues calling same-origin `/api`.

The `greenloop` schema is not exposed through the Supabase Data API. RLS is enabled without browser policies; anonymous/authenticated roles have no schema/table privileges. The database owner bypasses table RLS, so **existing server ownership/workspace filters remain the authorization layer**. Do not expose this schema or grant browser roles access. Membership intentionally stays one account per organization.

`002_private_evidence_bucket.sql` creates/configures private `material-evidence`. A restrictive policy blocks anonymous/authenticated access even if other buckets have broad permissive policies. The backend service key bypasses Storage RLS. Keep the bucket private.

Files use `<user UUID>/<upload UUID>` paths with overwrite disabled. PostgreSQL stores metadata and paths, not bytes. Signature validation, 4 MB per-file and 100 MB per-account limits remain enforced. `/api/uploads/<UUID>` still checks ownership or participation in a visible transaction before downloading bytes. Imported evidence links stay unchanged.

Storage cannot share a PostgreSQL transaction: successful writes are removed if a later database write fails, and failed cleanup logs orphan paths. A process crash or ambiguous upload response can leave an unreferenced object; reconcile those against `greenloop.uploads`. Never remove referenced files. Storage operations have a 15-second timeout.

References: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS), [node-postgres transactions](https://node-postgres.com/features/transactions).

## Supabase dashboard steps

1. Create a Supabase project and retain its database password. Use a fresh project for the first import; the importer refuses any existing application rows.
2. Open **Connect** and copy the direct PostgreSQL string or **session pooler** string on port 5432 for IPv4 networks. Substitute the password, URL-encoding special characters. Use a database-owner connection, normally `postgres`; the service role key is not the database password.
3. Copy the project URL and backend service role key from API settings to `.env`. The anon key is optional and unused. Do not paste secrets into chat or commit them.
4. In **SQL Editor**, run `001_initial_schema.sql` once, then `002_private_evidence_bucket.sql`. Alternatively, run `npm.cmd run db:migrate`: it recognizes the applied initial schema and safely reapplies bucket settings.
5. In **Storage**, confirm the private bucket and 4 MB PNG/JPEG/WebP/PDF configuration. Do not add public access policies.
6. Keep `greenloop` out of exposed Data API schemas. Inspect it with SQL Editor or Table Editor's schema selector.
7. If needed, download the Supabase CA certificate from connection settings and set `SUPABASE_DB_CA_FILE`. Remote TLS certificates are always verified.

## Environment and exact commands

`.env` and `server/data/` are ignored by Git. Edit an existing `.env`, or copy `.env.example` if it does not exist:

```dotenv
DATABASE_PROVIDER=postgres
SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@SESSION_POOLER_HOST:5432/postgres
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=BACKEND_ONLY_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=
SUPABASE_DB_CA_FILE=
PORT=3001
HOST=127.0.0.1
PUBLIC_ORIGIN=http://localhost:5173
```

Use the host/user from **your** connection dialog. `DATABASE_PROVIDER=sqlite` explicitly uses the old database. If the provider is omitted, a DB URL selects PostgreSQL; without it SQLite is selected. Invalid configuration fails instead of falling back. Preserve existing Google/email variables; the Google callback remains `${PUBLIC_ORIGIN}/api/auth/google/callback`.

Run from `greenloop/` with Node 24+. Stop all old SQLite API processes before backup/import. Do not discard WAL/SHM files while SQLite is active.

```powershell
npm.cmd ci
# Only if .env does not exist:
Copy-Item -LiteralPath '.env.example' -Destination '.env'
# Edit .env using the configuration above.
npm.cmd run build
npm.cmd run lint
npm.cmd run check:backend
npm.cmd run test:backend
npm.cmd run test:postgres

# Old API stopped; database closed/checkpointed:
Copy-Item -LiteralPath 'server/data/greenloop.sqlite' -Destination 'server/data/greenloop.pre-supabase.sqlite'
npm.cmd run db:migrate
npm.cmd run db:import
# Preview only: counts, no Supabase connection, no source writes.
npm.cmd run db:import -- --apply
npm.cmd run dev
```

Skip import if starting an empty demo. For another source, pass `--source=C:/path/to/greenloop.sqlite` (quote arguments containing spaces).

The importer opens SQLite read-only, checks integrity, repairs historical duplicate event IDs using the existing loader, and refuses unsupported fields/missing ownership. It preserves hashes, sessions, IDs, organizations, evidence and notifications. All rows import in one locked transaction; each imported row's values are verified before COMMIT. Files are uploaded without overwriting, with cleanup on failure. Keep SQLite and its backup until hosted verification succeeds.

## Verification and limitations

`test:backend` always uses temporary SQLite stores, regardless of configured production credentials. `test:postgres` runs workflow, CRUD and API audit suites through the adapter, plus migration/rollback/capacity/private-policy tests, using embedded PostgreSQL (PGlite) and an in-memory Storage double. Tests never connect to your Supabase project. Legacy duplicate-event corruption is tested with SQLite; PostgreSQL prevents duplicate primary keys.

The existing SQLite snapshot also passed relational import validation in temporary embedded PostgreSQL: 8 accounts, 11 projects, 13 passports, 5 bookings, 4 verifications, 107 events and 17 uploads. The source was read-only.

Completed checks: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run check:backend`, `npm.cmd run test:backend` (4 passing tests), and `npm.cmd run test:postgres` (8 passing tests). The existing SQLite snapshot passed row-by-row value verification after import into a temporary PostgreSQL database. Frontend/shared-domain/business-action source diffs are empty.

**Hosted checks remain pending:** Supabase credentials were unavailable, so real connection/TLS, Storage API calls, browser click-through, Google/email integrations and two-device verification were not performed. PGlite has one connection; concurrent HTTP tests exercise the adapter and its test lease, not cross-process hosted advisory locking.

Before the demo:

1. Set the PostgreSQL provider and start the API. `/api/health` must return `{"status":"ok"}`; startup must fail for unavailable database/migrations.
2. On two laptops, use the **same deployed app URL**. Register provider/receiver accounts and complete onboarding.
3. Provider: create a project and 10 t concrete passport with image/PDF evidence. Receiver: publish matching demand and dated 10 t capacity. Confirm discovery and shared updates within the existing refresh interval.
4. Submit/negotiate an offer, accept it, and confirm reservation/booking on both devices. Progress the existing pickup/dispatch controls.
5. Receive 9.5 t, verify 9 t accepted and 0.5 t rejected with a reason. Check inventory, provider verification, evidence, timeline events, notifications and read markers. Invalid totals or missing rejection reasons must fail.
6. An unrelated account must get 403 for a private unattached upload; an authorized participating receiver can download attached evidence. Browser traffic must not contain database credentials or service keys.
7. For a fresh 10 t slot, request 6 t simultaneously from two providers/devices/backend instances. One confirms, one holds. Cancel the eligible unaccepted reservation and check promotion. Confirmed totals must never exceed capacity.
8. Restart the API and confirm records/files/read markers persist. Verify password recovery, single-use tokens, session revocation and configured Google sign-in.

SQL Editor checks:

```sql
SELECT version FROM greenloop.schema_migrations;
SELECT count(*) FROM greenloop.users;
SELECT count(*) FROM greenloop.material_passports;
SELECT * FROM greenloop.inventory;
SELECT s.id, s."capacityT", coalesce(sum(b."tonnesT") FILTER (WHERE b.status='confirmed'),0) AS reserved_t
FROM greenloop.receiver_capacity s LEFT JOIN greenloop.bookings b ON b."slotId"=s.id
GROUP BY s.id, s."capacityT";
SELECT public FROM storage.buckets WHERE id='material-evidence'; -- false
```

## Deployment and rollback

Deploy the Node API and built frontend together behind HTTPS. Set `NODE_ENV=production`, HTTPS `PUBLIC_ORIGIN`, recovery email and host-managed secrets. Use `HOST=0.0.0.0` if required by hosting. Build before `npm.cmd start`; apply migrations separately. All instances must share the same database and private bucket, and all devices must use the deployed origin. Five-second polling supplies updates without Realtime/frontend changes. A static-only deployment or `vite preview` does not provide the API.

Allow for five PostgreSQL connections per API instance in your Supabase connection limit. Back up PostgreSQL and Storage. Development recovery mail still uses local ignored `server/data/mail-outbox.jsonl`; production requires the existing email webhook.

The PostgreSQL runtime does not read/write SQLite or store evidence bytes locally. SQLite models, read-only import and regression tests retain `node:sqlite` for fallback. Remove them only after hosted verification and an agreed retirement of rollback.

Rollback: stop the PostgreSQL API, preserve/back up Supabase rows/files, set `DATABASE_PROVIDER=sqlite`, and restart with retained `server/data/greenloop.sqlite` (or restore the stopped-server backup). No cloud data deletion is needed. The stores are **not synchronized**: writes/accounts created after PostgreSQL cutover will not exist in the old SQLite snapshot. Preserve PostgreSQL access or arrange a reverse migration if those new changes must survive rollback.
