# RFC: Auth Refactor — JWT Access Tokens + Refresh Token Rotation

**Date**: 2026-03-13
**Status**: Draft
**Type**: Refactor
**TDD Updates Required**: Yes

## 1. Context

Quizzly uses DB-backed opaque session tokens with 7-day expiry. When the token expires, the user is logged out — including mid-quiz. The system lacks refresh tokens, so there's no way to silently extend sessions. The user wants to adopt JWT-based auth with short-lived access tokens and long-lived refresh tokens, matching patterns from a reference project they built.

## 2. Goals and Non-Goals

### Goals

1. Switch from opaque tokens to JWT access tokens (15min) + JWT refresh tokens (7d) in httpOnly cookies.
2. Store refresh token hashes in DB for server-side revocation.
3. Rotate refresh tokens on every refresh (rolling 7-day expiry — active users never get logged out).
4. Add `POST /api/auth/refresh` endpoint.
5. Frontend auto-refreshes tokens silently via RTK Query 401 interceptor with mutex.
6. All expected auth errors excluded from Sentry (validation, wrong credentials, unverified email, expired tokens, duplicate email, bad reset/verification links).

### Non-Goals

1. Not changing signup/email-verification/password-reset flows.
2. Not adding Google OAuth (BL-004).
3. Not adding session invalidation on password change.
4. Not changing Prisma/service/route architecture.
5. Not replacing Zod validation with manual utility functions.

## 3. Detailed Design

### 3.1 New dependency

Install `jsonwebtoken` + `@types/jsonwebtoken`. Chosen over `jose` to match reference project API.

### 3.2 Prisma schema

Rename `AccessToken` model → `RefreshToken`. Same structure (id, userId, tokenHash, expiresAt, createdAt). Table renamed `access_tokens` → `refresh_tokens`. Existing rows truncated in migration (all sessions invalidated — users re-login once).

### 3.3 Token utilities (`token.utils.ts`)

Remove `generateOpaqueAccessToken`. Add:

- `generateAccessToken({ userId, email })` → signs JWT with `JWT_SECRET`, 15min expiry
- `generateRefreshToken({ userId, email })` → signs JWT with `REFRESH_SECRET`, 7d expiry
- `verifyAccessToken(token)` → returns `TokenPayload | null`
- `verifyRefreshToken(token)` → returns `TokenPayload | null`

Keep: `hashToken`, `generateVerificationToken`, `generateResetToken`, `parseExpiresInMs`.

### 3.4 Cookie handling (`cookie.utils.ts`)

Two cookies:

- `quizzly_session`: JWT access token, httpOnly, 15min maxAge, path `/api`
- `quizzly_refresh`: JWT refresh token, httpOnly, 7d maxAge, path `/api/auth/refresh` (scoped — only sent to refresh endpoint)

Add `setRefreshCookie()`, `clearRefreshCookie()`, `getRefreshCookieName()`.

### 3.5 Auth middleware

Replace DB lookup with `verifyAccessToken(token)`. No Prisma import needed. On valid JWT → attach `{ userId, email }` to `req.user`. On invalid/expired → 401.

### 3.6 Auth service changes

- `login()`: Generate JWT access token + JWT refresh token. Store refresh token hash in `RefreshToken` table. Return both tokens to route handler.
- New `refreshAccessToken(refreshToken)`: Verify JWT → hash token → find in DB → if valid: delete old refresh token, generate new access + refresh tokens, store new refresh hash → return both tokens. If invalid: throw `UnauthorizedError`.
- `logout(refreshToken)`: Delete refresh token from DB if present.

### 3.7 Auth routes changes

- Login handler: set both cookies via `setSessionCookie` + `setRefreshCookie`.
- Logout handler: read refresh token from cookie, call `authService.logout(refreshToken)`, clear both cookies.
- New `POST /refresh`: read refresh token from cookie, call `authService.refreshAccessToken()`, set both new cookies.

### 3.8 Env config

Add `REFRESH_SECRET: z.string().min(32)` to `env.ts` schema. Add to `.env.example`, Render env vars, CI secrets, and `vitest.config.ts` test env.

### 3.9 Shared constants

Remove `JWT_DEFAULT_EXPIRES_IN`. Add `ACCESS_TOKEN_EXPIRY = '15m'` and `REFRESH_TOKEN_EXPIRY = '7d'`.

### 3.10 Sentry filtering (`error.middleware.ts`)

Expand `isExpectedAuthError` to cover: failed login, session check 401, `EmailNotVerifiedError`, refresh 401, `ValidationError` on auth routes, `ConflictError` on signup, `BadRequestError` on auth routes. Stop sending `ZodError` to Sentry on auth routes.

### 3.11 Frontend (`store/api.ts`)

Update `baseQueryWithAuth`: on 401 → if not the refresh endpoint itself → call `POST /api/auth/refresh` → if success, retry original request → if fail, dispatch `logout()`. Use mutex to prevent concurrent refresh calls.

### 3.12 Test helper (`auth.helper.ts`)

`getAuthToken()`: generate JWT via `generateAccessToken()` instead of opaque token + DB insert. No DB row needed for access tokens anymore. Add `getRefreshToken()` helper that generates JWT + stores hash in `RefreshToken` table for refresh endpoint tests.

### Rejected alternatives

- **Opaque tokens with refresh**: Would keep DB lookups on every request. JWT eliminates this.
- **`jose` library**: User unfamiliar with API. `jsonwebtoken` matches reference project.
- **No refresh token rotation**: Active users would be forced to re-login every 7 days.
- **Incremental migration**: Hybrid opaque+JWT adds complexity with no benefit for 30 users.

## 4. Blast Radius

### Files modified

- `packages/server/src/utils/token.utils.ts`
- `packages/server/src/utils/cookie.utils.ts`
- `packages/server/src/middleware/auth.middleware.ts`
- `packages/server/src/services/auth.service.ts`
- `packages/server/src/routes/auth.routes.ts`
- `packages/server/src/middleware/error.middleware.ts`
- `packages/server/src/config/env.ts`
- `packages/server/prisma/schema.prisma` (+ new migration)
- `packages/shared/src/constants/auth.constants.ts`
- `packages/shared/src/index.ts`
- `packages/client/src/store/api.ts`
- `packages/client/src/api/auth.api.ts`
- `packages/server/vitest.config.ts`

### Tests rewritten

- `packages/server/src/utils/__tests__/token.utils.test.ts`
- `packages/server/src/services/__tests__/auth.service.test.ts`
- `packages/server/src/routes/__tests__/auth.routes.test.ts`
- `packages/server/src/__tests__/helpers/auth.helper.ts`
- `packages/client/src/store/api.test.ts`

### Tests verified (no code changes expected)

- `packages/server/src/routes/__tests__/session.routes.test.ts`
- `packages/server/src/routes/__tests__/material.routes.test.ts`
- `packages/server/src/routes/__tests__/quiz.routes.test.ts`
- `packages/server/src/routes/__tests__/dashboard.routes.test.ts`
- `packages/server/src/routes/__tests__/user.routes.test.ts`
- All E2E tests

## 5. Migration Plan

**Strategy:** Big bang cutover. All backend changes + Prisma migration deploy together. Frontend deploys alongside or immediately after.

**Sequence:** Install deps → add `REFRESH_SECRET` to all environments → Prisma migration (rename table, truncate rows) → deploy all backend + frontend code changes.

**Impact:** All existing sessions invalidated. 30 users re-login once.

**Rollback:** Revert merge commit + run reverse Prisma migration (`refresh_tokens` → `access_tokens`). No user data at risk.

## 6. Acceptance Criteria

1. Login sets two httpOnly cookies: `quizzly_session` (15min) and `quizzly_refresh` (7d, path `/api/auth/refresh`).
2. Auth middleware verifies JWT without DB call, attaches `{ userId, email }` to `req.user`.
3. `POST /api/auth/refresh` with valid refresh token returns new access token cookie, rotates refresh token (new cookie + new DB row, old row deleted).
4. `POST /api/auth/refresh` with expired refresh token returns 401, clears both cookies.
5. Logout clears both cookies and deletes refresh token from DB.
6. Frontend intercepts 401, calls refresh, retries original request. Mutex prevents concurrent refreshes.
7. Failed login, unauthenticated `/me` check, `EmailNotVerifiedError`, validation errors on auth routes, `ConflictError` on signup, `BadRequestError` on auth routes, and refresh 401 are all excluded from Sentry.
8. Signup, email verification, password reset, and resend verification flows work unchanged.
9. All protected routes (sessions, materials, quizzes, dashboard, user) work with JWT auth.
10. Tests use `TEST_DATABASE_URL` (no fallback), validate localhost, and include `REFRESH_SECRET` in test env.

## 7. TDD Updates Required (not implementation scope)

1. **Section 6.1**: Replace opaque token strategy with JWT access (15min) + refresh token (7d, rotated). Remove "no refresh token for MVP" rationale.
2. **Section 6.1**: Update token lifecycle to describe two-cookie flow and refresh rotation.
3. **Section 6.1**: Add `REFRESH_SECRET` env var requirement.
4. **Section 3.5**: Update `token.utils.ts` description to list JWT functions.
5. **Section 5**: Add `POST /api/auth/refresh` endpoint contract.
