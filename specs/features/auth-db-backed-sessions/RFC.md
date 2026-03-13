# RFC: Auth DB-Backed Sessions (Opaque Token + httpOnly Cookie)

**Date**: 2026-03-13
**Status**: Reviewed
**Type**: Refactor / Architectural Change
**TDD Updates Required**: Yes

---

## 1. Context

### What exists today

- **Login**: Server generates stateless JWT via `jwt.sign({ userId, email })`, no DB write.
- **Client storage**: JWT in `localStorage`. `api.ts` reads it, sends `Authorization: Bearer <token>`.
- **Auth middleware**: `jwt.verify(token)` only. No DB lookup. User deletion leaves JWTs valid until expiry.
- **SSE** (`useSSEStream`): Receives `token` prop from Redux, sends `Authorization: Bearer <token>` (EventSource can't set headers).

### Why it needs to change

Stateless JWT + localStorage: when a user is deleted (or DB restored from backup), their JWT remains valid. Server returns `NotFoundError` on getMe. Fix: store token hash in DB with `ON DELETE CASCADE` from users — user deletion invalidates tokens immediately.

### How we got here

TDD §6.1 chose stateless JWT for simplicity. Token revocation was deferred.

---

## 2. Goals and Non-Goals

### Goals

1. Token revocation on user delete — CASCADE removes token rows; requests fail 401.
2. No auth data in localStorage — token only in httpOnly cookie.
3. XSS-resistant auth — JS cannot read token.
4. Same API surface — protected endpoints unchanged; transport changes only.

### Non-Goals

- Password-change token invalidation (unchanged per TDD).
- Refresh tokens.
- Multi-device session management ("sign out other devices").

---

## 3. Detailed Design

### 3.1 Token model: Opaque + hash in DB

- Generate random token (32 bytes hex, same pattern as `verification_token` / `password_reset`).
- Store `hashToken(rawToken)` in `access_tokens` table.
- Cookie contains raw token. Auth middleware: hash cookie value, lookup by hash.
- **Choice**: Opaque over JWT — simpler, aligns with existing token patterns, one DB lookup per request. JWT adds complexity without benefit when we always validate via DB.

### 3.2 Schema: AccessToken

```prisma
model AccessToken {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  tokenHash String   @unique @map("token_hash") @db.VarChar(255)
  expiresAt DateTime @map("expires_at") @db.Timestamptz
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId])
  @@map("access_tokens")
}
```

Add `accessTokens AccessToken[]` to User model. Expiry from `JWT_EXPIRES_IN` (e.g. 7d).

### 3.3 Auth flow

**Login** (`auth.service.ts`):

1. Validate credentials, check emailVerified.
2. `{ token, hash } = generateAccessToken()` (new util: `generateOpaqueAccessToken`).
3. `prisma.accessToken.create({ data: { userId, tokenHash, expiresAt } })`.
4. Return `{ user }` (no token in body). Set cookie in response: `Set-Cookie: quizzly_session=<rawToken>; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=604800`.

**Auth middleware** (`auth.middleware.ts`):

1. Read token from `req.cookies.quizzly_session` (fallback: `Authorization: Bearer` — retained for integration tests and API clients such as curl).
2. If missing → 401.
3. `tokenHash = hashToken(token)`.
4. `accessToken = prisma.accessToken.findUnique({ where: { tokenHash }, include: { user: true } })`.
5. If !accessToken or expiresAt < now → 401.
6. `req.user = { userId: accessToken.userId, email: accessToken.user.email }`.

**Logout** (new endpoint `POST /api/auth/logout`):

- Clears cookie: `Set-Cookie: quizzly_session=; Max-Age=0; Path=/api`.
- Optional: delete token row (idempotent). Not required for UX — cookie gone is enough; row can stay until expiry.

### 3.4 Cookie configuration

- Name: `quizzly_session`.
- Path: `/api` (only sent to API routes).
- Domain: default (API host) — no cross-subdomain. Client at app.quizzly-ai.com requests api.quizzly-ai.com; cookie set by API is sent automatically with `credentials: 'include'`.
- SameSite: Lax.
- Secure: true in production.

### 3.5 Client changes

- **auth.slice**: Remove `token` from state. Keep `user` only. `isAuthenticated = user !== null`. Remove all localStorage use for auth. `logout` clears user and dispatches API call to `/auth/logout` (to clear cookie).
- **api.ts**: Remove `Authorization` header from `prepareHeaders`. Add `credentials: 'include'` to `fetchBaseQuery` so cookies are sent.
- **auth.api.ts**: Login response no longer returns `token`. `onQueryStarted` sets user from `data` only. getMe: always run on app load (no `skip: !needsHydration`) — we can't know if we have a cookie without requesting; one getMe on init discovers session.
- **AuthGate** (`App.tsx`): Run getMe on mount. While loading: spinner. Success: set user. 401: no user. Network error: call logout (clears cookie via POST /auth/logout).
- **useSSEStream**: Remove `token` prop. Use `credentials: 'include'` in fetch. Auth middleware reads from cookie.
- **ProtectedRoute**: `isAuthenticated = user !== null`. No token check.

### 3.6 Server: cookie parser

Express needs `cookie-parser` (or equivalent) to populate `req.cookies`. Add middleware before auth routes.

### 3.7 Removals

- `generateAccessToken` (JWT) from `token.utils.ts` for access tokens — keep for any legacy during migration; remove after cutover.
- JWT verification in auth middleware.
- `JWT_SECRET` env var can remain for verification/reset if those ever use it; otherwise remove when JWT fully gone.

---

## 4. Blast Radius

### Files directly modified

- `packages/server/prisma/schema.prisma` — add AccessToken model
- `packages/server/src/services/auth.service.ts` — login creates token row, sets cookie; add logout
- `packages/server/src/middleware/auth.middleware.ts` — read from cookie, lookup by hash
- `packages/server/src/utils/token.utils.ts` — add `generateOpaqueAccessToken` (or reuse pattern from reset token)
- `packages/server/src/routes/auth.routes.ts` — add POST /logout
- `packages/server/src/app.ts` — add cookie-parser, ensure CORS credentials
- `packages/client/src/store/slices/auth.slice.ts` — remove token, localStorage
- `packages/client/src/store/api.ts` — credentials: 'include', remove Authorization
- `packages/client/src/api/auth.api.ts` — login no token, getMe always run
- `packages/client/src/App.tsx` — AuthGate logic
- `packages/client/src/hooks/useSSEStream.ts` — remove token prop, add credentials
- `packages/client/src/hooks/useQuizGeneration.ts` — useSSEStream call site
- `packages/client/src/hooks/useQuizGrading.ts` — useSSEStream call site

### Files indirectly affected

- `packages/client/src/components/common/ProtectedRoute.tsx` — uses selectIsAuthenticated
- `packages/client/src/pages/auth/LoginPage.tsx` — login mutation response handling
- `packages/server/src/__tests__/helpers/auth.helper.ts` — getAuthToken for tests (must create token row + set cookie for integration tests)
- E2E auth helper — ensure cookies sent with Playwright requests

### Tests affected

- All `*routes.test.ts` that use `getAuthToken` — backend tests need cookie-based auth
- `auth.service.test.ts`, `auth.routes.test.ts`
- `auth.api.test.ts`, `api.test.ts`
- `useSSEStream.test.ts`, `useQuizGeneration.test.ts`
- E2E specs: `signup-verify-login.spec.ts`, etc.

### Dependencies

- Add `cookie-parser` (or use Express built-in if available in v5).

---

## 5. Migration and Rollback

### Migration strategy

Big-bang cutover. No backwards compatibility — old JWTs in localStorage stop working.

1. Deploy server: new schema (migration), auth middleware reads cookie first, falls back to `Authorization: Bearer` for 1 release.
2. Deploy client: uses cookies, stops sending Authorization.
3. Next release: remove Bearer fallback.

Alternative: single deploy. Users with old JWT get 401, must re-login. Acceptable for 30-user MVP.

### Data migration

- New table `access_tokens`. No backfill — existing JWTs invalidated; users re-login.

### Rollback

- Revert to previous release. Old client (localStorage + Bearer) works with old server (JWT verify).
- If rollback after schema applied: `access_tokens` table remains but is unused. Safe.

---

## 6. Acceptance Criteria

### Success criteria

- **Given** a user logs in **When** login succeeds **Then** they receive Set-Cookie with httpOnly session cookie; no token in response body.
- **Given** a user has valid session cookie **When** they request GET /api/auth/me **Then** they receive 200 with user data.
- **Given** a user is deleted **When** a request uses their former token **Then** server returns 401 (token row CASCADE-deleted).
- **Given** a user clicks Logout **When** logout completes **Then** cookie is cleared and they are redirected to login.

### Regression criteria

- **Given** protected route **When** unauthenticated **Then** redirect to login.
- **Given** SSE quiz generation **When** authenticated **Then** stream works (cookie sent via credentials).
- **Given** E2E signup → verify → login **Then** user lands on dashboard.

### Rollback criteria

- **Given** revert deploy **When** previous client + server run **Then** auth works with localStorage JWT.

---

## 7. TDD Updates Required (not implementation scope)

- **§6.1 Authentication Strategy**: Replace "Stateless JWT" with "DB-backed opaque session token". Token lifecycle: login creates row, cookie set; logout clears cookie. Storage: httpOnly cookie (no localStorage).
- **§5.2 Auth Endpoints**: Add POST /api/auth/logout. Update POST /api/auth/login response (no token field).
- **§6.4 CORS**: Confirm `credentials: true` documented (already present in app.ts).
