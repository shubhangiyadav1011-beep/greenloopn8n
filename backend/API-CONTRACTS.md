# Existing GreenLoop API contract

This contract records the HTTP surface retained during the MVC refactor. JSON error responses retain the existing `{ "error": "..." }` shape. Mutating requests still require `X-GreenLoop-Client: web`, an allowed `Origin` when supplied, and JSON content type.

| Method | Path | Authentication | Request body | Success response |
|---|---|---|---|---|
| GET | `/api/health` | No | None | `200 { "status": "ok" }` |
| GET | `/api/config` | No | None | `200 { "googleEnabled": boolean, "developmentMail": boolean }` |
| GET | `/api/auth/google` | No | None | `302` to Google; `503` if OAuth is not configured |
| GET | `/api/auth/google/callback` | No | OAuth query and matching OAuth cookie | `302` to `/app`, `/onboarding`, or sign-in with an error |
| GET | `/api/auth/me` | No | None | `200 { "user": user-or-null }` |
| POST | `/api/auth/register` | No | `{ email, password, name?, organization? }` | `201 { "user": user }`, session cookie |
| POST | `/api/auth/login` | No | `{ email, password, remember? }` | `200 { "user": user }`, session cookie |
| POST | `/api/auth/logout` | No | Ignored | `200 { "ok": true }`, clears session cookie |
| POST | `/api/auth/forgot-password` | No | `{ email }` | `200 { "ok": true }` |
| POST | `/api/auth/reset-password` | No | `{ token, password }` | `200 { "ok": true }` |
| PATCH | `/api/profile` | Yes | Partial profile fields; optional `workspaces`, `activeWorkspace` | `200 { "user": user }` |
| GET | `/api/dataset` | Yes | None | `200 { "dataset": visibleDataset }` |
| POST | `/api/actions` | Yes | `{ action, args }` | `200 { "dataset": visibleDataset, "result": value }` |
| POST | `/api/uploads` | Yes | `{ name, data }` | `201 { "ref": "/api/uploads/{id}" }` |
| GET | `/api/uploads/{id}` | Yes | None | `200` file bytes with the stored media type and private content headers |

Validation/authentication/authorization and workflow failures keep their existing status codes (including `400`, `401`, `403`, `404`, `409`, `413`, `415`, `429`, and `503` where applicable). Unknown API paths remain authenticated and return `404 { "error": "API endpoint not found." }` for authenticated callers.

The backend also serves the existing frontend for `GET` and `HEAD` non-API requests.
