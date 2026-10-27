# GreenLoop audit — 3 October 2026

## Project status

| Area | Status | Evidence and limit |
| --- | --- | --- |
| Frontend | Partially Working | Production build and live Vite module checks pass. Browser rendering, clicks, responsiveness, and console inspection remain unverified. |
| Backend | Working for tested local workflows | Both integration suites pass against real HTTP servers and SQLite databases. Google and external email delivery are not verified. |
| Database | Working with historical ID repair on reads | Existing database inspected read-only: eight expected tables; `PRAGMA integrity_check` returns `ok`; no orphan material/slot/booking/verification relationships. Four historical event-ID duplicates are repaired in API reads and persisted on the next successful workflow write. |
| Frontend–backend integration | Partially Working | Live Vite proxy and API contract tests pass; operational components call the real API. A complete browser journey could not be executed. |

This is an executed build/API/database audit with source review of the frontend, **not a completed visual or interactive browser audit**. The Browser plugin reported “No browser is available”; supported browser discovery returned an empty list. No screenshots or browser-console evidence were obtained. HTTP 200 for a React route confirms that the SPA shell is served, not that its components render correctly.

Existing project data was not changed or deleted. Workflow tests use isolated temporary databases; the existing SQLite database was opened read-only for schema/integrity inspection. The pre-existing `package-lock.json` modification was preserved. No dependencies were installed or upgraded.

## Project understanding and commands

The application lives in `greenloop/`, with 301 original source files including SVGs and unused template components. `src/App.tsx` registers the public homepage, authentication, provider workspace, receiver workspace, and fallback routes. `src/pages/app/` contains the operational screens; `src/components/site/` contains public-site storytelling; contexts manage authentication, language, theme, and sidebar; `src/store/` manages server-loaded operational state; `src/domain/` contains shared types, matching/capacity logic, metrics, events, and an illustrative dataset.

Frontend: React 19, TypeScript, Vite 8, React Router 8, Tailwind CSS 4, Motion, react-i18next/i18next. The repository's template README and AGENTS stack notes contain outdated versions; package.json and BACKEND.md describe the current run requirements. Node 24.12.0 was used. Additional installed dependencies include FullCalendar, ApexCharts, Swiper, Leaflet, MapLibre, dropzone, and drag-and-drop libraries; many belong to retained template pages rather than active GreenLoop routes.

Backend: native Node HTTP server (`server/server.mjs`), shared TypeScript action engine (`server/actions.ts`), native `node:sqlite`; no Express server or external database service. Authentication uses scrypt password hashes, hashed random session tokens, HttpOnly/SameSite cookies, expiry, server-owned profiles, and workspace/entity authorization. Recovery uses hashed, expiring, single-use reset tokens and session revocation. Optional Google OAuth uses server-side code exchange, state, and PKCE.

SQLite tables: `users`, `sessions`, `resets`, `state`, `owners`, `uploads`, `google_identities`, `oauth_states`. Operational collections are stored as a JSON document in `state`; business mutations use `BEGIN IMMEDIATE` and commit ownership/state together. Relationships are enforced by application logic rather than declared SQL foreign-key constraints. Required operational references and unique IDs were checked in fixtures. No general project/material DELETE or editing endpoint exists.

Environment variables: `PORT`, `HOST`, `PUBLIC_ORIGIN`, `NODE_ENV`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_TOKEN`. `.env.example` is tracked; private `.env` files and `server/data/` are ignored. No secret values are recorded in this report. Google and email webhooks are the only authentication integrations; there is no AI material-identification service or live logistics tracking service.

Run from `greenloop/`:

```powershell
npm.cmd run dev                 # frontend 5173 + backend 3001
npm.cmd run dev:frontend        # Vite alone, proxies /api to backend
npm.cmd run dev:backend         # API alone
npm.cmd run build               # tsc + Vite production build
npm.cmd run check:backend
npm.cmd run test:backend
npm.cmd run lint
npm.cmd start                   # built frontend + API together
```

PowerShell's script execution policy blocks the `npm.ps1` wrapper here; `npm.cmd` works without changing policy. Production requires HTTPS `PUBLIC_ORIGIN`, `NODE_ENV=production`, a built `dist/`, and persistent database storage. `vite preview` alone does not provide the integrated API. Default ports were already occupied, so audit-owned servers ran at frontend 5174/API 3101 without stopping the existing application.

## Executed checks and working features

| Check | Result |
| --- | --- |
| Installed dependency tree (`npm.cmd ls --depth=0`) | Pass; no missing/conflicting top-level packages reported |
| Registry vulnerability audit (`npm.cmd audit --json`) | Pass; zero known reported vulnerabilities |
| Production build | Pass; approximately 965 kB JavaScript / 259 kB gzip; bundle-size warning remains |
| Backend TypeScript check and server JavaScript syntax check | Pass |
| Backend tests | Two integration suites pass, covering all 18 action types |
| Lint | Zero errors; 17 Fast Refresh export warnings |
| Live frontend module/asset audit | 177 TS/TSX/CSS/JSON files inspected; no module failures or missing literal local media references |
| Live API proxy | `/api/health`, `/api/config`, `/api/auth/me` succeed; unauthenticated `/api/dataset` correctly returns 401 |
| Production route refresh | 29 public/auth/provider/receiver paths serve the SPA shell |
| Existing database integrity | Pass, read-only |

Verified through real API requests: account registration; duplicate-account rejection; login and wrong-password rejection; profile/workspace updates; ownership rejection; project creation; material/passport creation and evidence upload; capacity creation and edits; duplicate-slot rejection; demand publication; provider offers and receiver acceptance/decline; confirmed and held bookings; partial acceptance; rescheduling; cancellation; FIFO hold promotion; dispatch approval requirements; arrival recording; acceptance/rejection reconciliation; private support records; recovery tokens and session revocation; state/session persistence after server restart; concurrent reservation limits; authorized evidence downloads and unauthorized-download rejection.

The added audit tests also check report totals for held reservations, accepted recovery weight, and reservations belonging to other providers. Upload validation rejects mismatched file signatures. Mutation requests reject disallowed origins, missing custom verification headers, invalid JSON, and incorrect content types. Public responses do not expose password hashes or session tokens.

## Issues found and fixes applied

Frontend-only fixes below passed compilation and live module checks; their click behavior is **not browser-verified**. Backend fixes have real HTTP regression coverage.

| Feature/problem | Exact file(s) | Root cause and smallest fix | Retest |
| --- | --- | --- | --- |
| Duplicate activity IDs | `src/domain/capacity.ts`, `server/server.mjs` | Several transitions generated IDs from a fresh local event array. Generate against the persistent history/highest ID; deterministically normalize historical duplicates on read without dropping events. | Mixed-action unique-ID assertions and preservation/persistence regression pass. Four duplicates found in the existing DB are repaired by the new read path; the audit did not rewrite that DB. |
| Acceptance could book a past slot | `server/actions.ts`, `server/server.mjs` | Offer acceptance ignored the current date; creation endpoints allowed past dates. Filter acceptance slots and reject expired capacity/demand dates. | Old-slot fixture returns 409; past-date creation returns 400. |
| Failed reschedule reported success | `server/actions.ts` | An unsuccessful move appended an event, making the dataset look mutated and returning success. Leave state unchanged so the API returns 409. | Inadequate slot returns 409 without changing booking; increased-capacity move succeeds. |
| Provider could not cancel held requests | `src/domain/capacity.ts`, `src/pages/app/Bookings.tsx` | Release logic only handled confirmed bookings; UI omitted held cancellation. Support held cancellation without claiming capacity was released; retain hold promotion for confirmed cancellation. | Held cancellation persists; original concurrency/cancellation suite passes. |
| Alternate verification path lacked rejection reason validation | `server/server.mjs` | `verifyAction` bypassed the reason rule present in `verifyLoadAction`. Require a bounded nonempty reason for rejected weight. | Missing reason returns 400; valid reconciliation succeeds. |
| Malformed owned IDs returned an authorization error | `server/server.mjs` | Ownership queries accepted unvalidated identifiers. Validate record ID type/length before querying. | Object ID returns 400. Null evidence was already safely rejected and remains covered. |
| Missing production assets returned HTML/200 | `server/server.mjs` | SPA fallback applied to nonexistent static files. Require a real file for extension-bearing requests and return 404. | Missing PNG returns 404; registered SPA paths still serve correctly. |
| Reports overstated reservations/free capacity | `src/pages/app/Reports.tsx`, `src/domain/metrics.ts` | Held/pending bookings counted as reserved; other providers' public reservation totals were ignored. Use confirmed bookings for recovery-flow reservation totals and shared slot-ledger arithmetic for capacity totals. | Held requests reserve zero; cross-provider reservations are included; accepted recovery total passes. |
| Pending receipts showed completed verification | `src/components/greenloop/AppExploration.tsx`, `src/pages/app/MaterialPassport.tsx` | Existence of a receipt was treated as final verification. Require a non-pending status for completion. | Build/module checks; UI interaction remains unverified. |
| Open Project links ignored the selected project | `src/pages/app/Projects.tsx`, `Materials.tsx`, `MaterialPassport.tsx`, `Receivers.tsx`, `NewSurvey.tsx`, `src/components/header/GlobalSearch.tsx`, `src/components/greenloop/AppExploration.tsx` | Links sent project state to the generic home page, which ignored it. Open project-filtered materials via a persistent query parameter; honor project selection for adding/matching material. | Build/module checks and direct query-route serving pass. |
| Remaining material could not be offered after partial reservation | `src/pages/app/MarketDemand.tsx` | Passport selector allowed only surveyed/passport-ready status. Select noncancelled passports with uncommitted quantity, using booking quantities. | Backend re-offering residual material passes; frontend build/module checks pass. |
| Fake organization/name in profile form | `src/pages/app/Profile.tsx` | Missing fields fell back to demo identities that could be saved to a real account. Use actual account values or empty strings. | Build/module checks; profile PATCH remains covered. |
| Notification indicator unrelated to events | `src/components/header/NotificationDropdown.tsx` | Initial indicator was always on and never returned for later activity. Track the latest seen event within the account/workspace; close dropdown on full-trail navigation. | Build/module checks; browser behavior unverified. Seen state is intentionally session-local. |
| Dead Learn more button / expired alternate-slot choices | `src/pages/app/receiver/IncomingRequests.tsx`, `src/pages/app/Receivers.tsx` | Button had no handler and slot selectors included historical dates. Navigate to workflow support and filter current slots. | Build/module checks; API rejects past slot operations. |
| Project activity timestamp remained at creation | `server/server.mjs` | Actions updated events but never refreshed `lastActivityAt`. Synchronize it with the latest event touching the project or its materials. | Integration tests and backend checks pass. |

## API status

The API exposes a dataset and action dispatcher rather than separate `/api/materials` CRUD endpoints. Every available endpoint is listed below.

| Method | Endpoint | Purpose | Tested result / issue |
| --- | --- | --- | --- |
| GET | `/api/health` | Server health | Working, 200 |
| GET | `/api/config` | Integration availability | Working, 200; Google disabled in audit environment |
| GET | `/api/auth/me` | Restore authenticated profile | Working, 200; anonymous user is null |
| POST | `/api/auth/register` | Create account/session | Working, 201; invalid input 400; duplicate email 409 |
| POST | `/api/auth/login` | Password session | Working, 200; wrong credentials 401 |
| POST | `/api/auth/logout` | Revoke current session | Working, 200; subsequent profile is anonymous |
| POST | `/api/auth/forgot-password` | Issue recovery email/token | Working in development, 200; development outbox used. Live webhook delivery untested. |
| POST | `/api/auth/reset-password` | Consume token/change password | Working, 200; reuse 400; previous sessions revoked |
| GET | `/api/auth/google` | Start Google OAuth | Expected 503 without credentials; successful provider exchange untested |
| GET | `/api/auth/google/callback` | Finish Google OAuth | Invalid-state request safely redirects (302) to sign-in; successful exchange untested |
| PATCH | `/api/profile` | Profile/onboarding/workspace | Working, 200; invalid workspace switch 403 |
| GET | `/api/dataset` | Authorized workspace state | Working, 200; anonymous 401; cross-account private data filtered |
| POST | `/api/actions` | Operational mutations | Working for all listed actions; validation 400, ownership 403, unknown action 404, invalid transition 409 |
| POST | `/api/uploads` | Store private evidence | Working, 201; mismatched content 400 |
| GET | `/api/uploads/:id` | Read authorized evidence | Working, 200; unrelated account 403; missing file 404 |

All operational requests use `POST /api/actions` with `{ action, args }` and return `{ dataset, result }`.

| Action | Purpose | Result |
| --- | --- | --- |
| `addProjectAction` | Create demolition/recovery project | Working |
| `addMaterialAction` | Create material passport | Working |
| `addDemandAction` | Publish receiver request | Working; past date rejected |
| `addCapacityAction` | Create dated intake slot | Working; duplicate and past slot rejected |
| `updateCapacityAction` | Change intake limit | Working; reduction below reserved quantity rejected |
| `requestCapacityAction` | Reserve capacity or hold | Working; concurrency/quantity checks pass |
| `cancelBookingAction` | Cancel undispatched booking | Working for confirmed and held; dispatched cancellation rejected |
| `dispatchAction` | Send approved load | Working; receiver approval required |
| `addOfferAction` | Offer passport against demand | Working; provider identity enforced by server |
| `acceptOfferAction` | Receiver accepts, creates booking | Working; expired slots rejected |
| `declineOfferAction` | Receiver declines offer | Working |
| `acceptRequestAction` | Approve request / partially confirm hold | Working |
| `rejectRequestAction` | Receiver declines booking request | Working |
| `rescheduleRequestAction` | Move held booking | Working; inadequate target returns 409 |
| `receiveLoadAction` | Record arriving weight | Working; duplicate arrival rejected |
| `verifyLoadAction` | Finalize receipt | Working; weight equality and rejection reason enforced |
| `verifyAction` | Alternate single-step reconciliation | Working; rejection reason now enforced |
| `addSupportRequestAction` | Store private support ticket | Working; server uses account email |

## Frontend–backend trace

| Feature | Component → request → logic/storage → frontend update |
| --- | --- |
| Authentication/profile | `SignInForm`, `SignUpForm`, `Onboarding`, `Profile` → `AuthContext` → auth/profile API → SQLite users/sessions/profile → authenticated user state |
| Project/material creation | `NewSurvey` → store `addProjectAction` / `addMaterialAction` → `/api/actions` → ownership/validation + shared action engine + transaction → returned dataset/passport and completion screen |
| Evidence | `NewSurvey` → `uploadFile` → `/api/uploads` → signature/size/ownership validation + SQLite blob → passport reference and authenticated download links |
| Material listings/passport | `Materials`, `MaterialPassport` → store load/poll `/api/dataset` → visibility filter + SQLite state → listing, search/category filters, passport details |
| Capacity/matching | `receiver/Capacity`, `Receivers` → capacity/request actions; local `computeMatch` over real server records → SQLite transaction/shared ledger → confirmed/held booking and updated capacity |
| Marketplace interaction | `receiver/Demand`, `MarketDemand` → demand/offer actions → server validates ownership, material quantity and receiving slots → offers/bookings/demand coverage replace store dataset |
| Logistics/recovery | `Deliveries`, receiver delivery/verification pages → dispatch/receive/verify actions → approved booking + measured-weight reconciliation → persisted events/verification and refreshed screens |
| Activity/dashboard/reports | `NotificationDropdown`, `AuditTrail`, `Operations`, `Explore`, `Reports` → returned/polled dataset → events/accepted verification weight → computed totals and timeline |
| Support | `Support` → support action → private record in SQLite state/owners → confirmation and ticket history |

API URLs are same-origin `/api...`; Vite proxies to configured backend `PORT`, default 3001. Mutation responses replace the store dataset; polling runs every five seconds and on focus. Pending/error banners and auth/form success states exist in source. Search/category filtering is client-side over server-supplied data. No fake operational dataset fallback was introduced. Theme/language preferences intentionally use browser storage.

## Remaining issues and security findings

1. **Browser QA remains outstanding:** actual navbar/footer navigation, forms/modals/dropdowns, validation feedback, pending/error/success states, keyboard use, theme changes, responsive layouts, refresh/session restoration in a browser, and browser-console cleanliness cannot be certified. Their source paths were reviewed and modules/build tested, but this does not replace click-through QA.
2. **Receiver marketplace discovery is limited:** receivers can see materials attached to their own offers/bookings, not all newly listed provider passports. A receiver posting demand and a provider sending an offer works. Automatic publication into a receiver-wide browseable material marketplace is not implemented; `receiver/Overview`'s Find Materials shortcut operates on the restricted visible dataset. Changing this would require an explicit publication/privacy design, not exposing all private inventory during an audit.
3. **Project/material editing is incomplete:** project creation supports a status, and booking actions drive material statuses. There is no project-status update, general material-edit/delete, demand pause/delete, or capacity deletion API. Project recovery progress can reflect one completed load rather than completion of every material; material status is one coarse field even when different portions are at different stages. Do not interpret a verified passport label as proof all surveyed tonnes were recovered; use accepted-weight totals.
4. **External authentication/email:** Google credentials and webhook delivery are optional and untested. Production password recovery needs delivery configuration. Development outbox is private server data; tokens were not printed.
5. **Database design:** JSON document storage has application-enforced relationships, no declared relational FKs for user/entity references, and limited historical/profile timestamps. Tests found valid fixture relationships and existing DB integrity, but a relational migration was not attempted. The existing DB contains four historical event-ID duplicate occurrences and zero orphan material/slot/booking/verification relationships. The new read path preserves all event contents and assigns unique duplicate IDs; a successful workflow transaction persists that normalization. Existing running backend processes must restart to load these fixes.
6. **Security:** no recognizable committed credential/private-key patterns were found in the tracked text scan; only `.env.example` is tracked. Parameterized SQL, ownership checks, restricted private files, protected operational routes, and CSRF/origin controls are present and exercised. Accounts/facilities are self-registered without independent identity/email verification, which remains a trust limitation. Rate limiting covers authentication; operational mutations/uploads have quantity/storage limits but no general per-user rate limiter. No unrestricted admin route was found. This was a focused audit, not a penetration test or exhaustive secret-history scan.
7. **Code quality/performance:** React Fast Refresh warnings remain in mixed-export component/context files; large `kit.tsx`/`AppExploration.tsx`/`Reports.tsx` modules and unused template pages/assets remain. Many existing GreenLoop labels/styles bypass the repository's localization/design-token conventions. Language switching therefore does not translate the whole operational UI. The production bundle exceeds Vite's warning threshold. None of these was addressed with a broad refactor or dependency upgrade.
8. **Distances and analytics:** new facilities have unknown distance; search/result text can still show zero kilometres in some views. Handling/transport costs are indicative rather than quotes. No implemented, measured recovered-value or CO₂ methodology was found; accepted recovery tonnes are the real impact measure currently supported.
9. **Support/notifications:** support tickets are persisted but no outbound support delivery/admin resolution workflow exists. Notifications are a dataset event feed, not push/email notifications with durable unread state. Logistics are workflow statuses and illustrative media, not carrier integration or live tracking.

## Hardcoded / mock data

The public homepage intentionally uses `src/domain/demoData.ts` and illustrative material/capacity narratives through site components. Figures there are examples, not authenticated operational totals. Public videos, stock site/material/facility images (`src/config/siteMedia.ts`, `appMedia.ts`) and the default profile avatar are illustrative. Capacity matching retains a seed-specific `DEMAND_SIGNALS` fallback for demo facility IDs, and fixed suitability/cost coefficients in `src/domain/capacity.ts`; live facilities use real demand/capacity records. Retained template pages contain sample chart/calendar/table/profile data but are not registered GreenLoop routes. Demo identity defaults in the active Profile form were removed. Operational pages obtain records from the backend; they do not load the seed as a replacement database.

## Console/server errors

Remaining observed warnings: Node's experimental SQLite warning, Vite's large-chunk/plugin-timing warnings, and 17 ESLint Fast Refresh warnings. Initial audit-owned startup attempts encountered ports 3001/5173 already in use; isolated ports resolved that without stopping existing processes. The npm audit initially failed under sandbox network restrictions and succeeded with approved registry access. All final API suites, production build, type/syntax checks, and live HTTP/module checks pass. Browser console errors are **unknown**, not confirmed absent.

## Final user flow

Executed API journey: register provider and receiver → onboard workspaces → receiver publishes dated capacity/demand → provider creates demolition project/material passport/evidence → provider offers or requests capacity → receiver accepts → provider dispatches → receiver records actual weight → receiver verifies accepted/rejected weight → provider reads recovery/event data → server restarts → sessions and project/verification records persist.

The existing integration fixture records 9.5 t received, 9 t accepted, and 0.5 t rejected; the added alternate-verification fixture records 2 t received, 1 t accepted, and 1 t rejected. Shared report calculations return accepted recovery weight, and confirmed reservations include the public ledger quantities owned by other providers. All 18 operational actions have executed HTTP coverage.

**The demand/offer/recovery flow works at the API/database level. Full UI end-to-end completion is unverified because no browser was available; automatic receiver-wide marketplace publication remains absent.**

Reproducible checks are in `server/backend.test.mjs`, `server/audit.test.mjs`, and `scripts/audit-http.mjs`. `AUDIT_HTTP_RESULTS.json` records the live serving/proxy/module result. To run the isolated read-only HTTP audit locally, start `node scripts/audit-live.mjs`, start Vite with backend PORT 3101 and frontend `--port 5174`, then run `node scripts/audit-http.mjs`. The API workflow tests independently create fresh databases and include graceful restart/persistence checks.
