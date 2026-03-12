# RFC: Secure API Key Storage for BYOK

**Date**: 2026-03-11
**Status**: Reviewed (2026-03-12 — see REVIEW.md)
**Type**: Refactor
**TDD Updates Required**: Yes

## 1. Context

**Current state:** BYOK API keys are ephemeral — stored in a module-level variable (`apiKeyStore.ts`), sent per-request via `X-Anthropic-Key` header, never persisted. Users re-enter their key on every page refresh.

**Problem:** Significant UX friction for a training platform where users take quizzes across days/weeks. The ephemeral design was an intentional MVP trade-off (BYOK spec scoped persistence out explicitly) that's now validated and ready to upgrade.

**This RFC:** Persists API keys server-side with AES-256-GCM encryption at rest. Adds a profile page for key/account management. Removes the header-based key flow entirely.

## 2. Goals and Non-Goals

### Goals

1. Users enter API key once — persists across refreshes, sessions, tabs
2. Keys encrypted at rest with AES-256-GCM; DB breach alone doesn't expose keys
3. Three API key endpoints: save, delete, status (masked hint, never full key)
4. Server reads key from DB during quiz generation/grading — client never sends it
5. New profile page at `/profile` — manage username, password, API key
6. Frontend replaces ephemeral `apiKeyStore` with RTK Query mutations

### Non-Goals

- Key rotation, multiple keys per user, auto-expiry
- Pre-validation against Anthropic API on save
- Usage tracking, multi-provider support
- Key editing (delete + re-enter)

## 3. Detailed Design

### 3.1 Database Changes (User table)

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `encrypted_api_key` | TEXT | Yes | AES-256-GCM ciphertext: `base64(iv \|\| authTag \|\| ciphertext)` |
| `api_key_hint` | VARCHAR(20) | Yes | Masked display: `sk-ant-...{last4}` — avoids decrypting for status |

Both null when no key saved. Both set/cleared together.

### 3.2 Encryption Utility

**File:** `packages/server/src/utils/encryption.utils.ts`

Generic AES-256-GCM functions — reusable, not API-key-specific:
- `encrypt(plaintext: string): string` — random 12-byte IV, returns `base64(iv + authTag + ciphertext)`
- `decrypt(encrypted: string): string` — decodes, splits at fixed offsets (12, 16, rest), decrypts

Uses Node.js built-in `crypto`. No external dependency.

**Env var:** `API_KEY_ENCRYPTION_KEY` — 64-char hex string (32 bytes). Added to `env.ts` Zod validation and `.env.example`. Generate: `openssl rand -hex 32`.

### 3.3 API Endpoints

**New files:** `user.routes.ts` + `user.service.ts` (follows existing domain pattern: auth, session, quiz, now user).

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| `GET` | `/api/users/api-key/status` | — | `{ hasApiKey, hint }` | — |
| `POST` | `/api/users/api-key` | `{ apiKey }` | `{ hasApiKey: true, hint }` | 400 invalid format |
| `DELETE` | `/api/users/api-key` | — | 204 No Content | — |
| `PATCH` | `/api/users/profile` | `{ username }` | Updated user object | 400 validation |
| `PUT` | `/api/users/password` | `{ currentPassword, newPassword }` | `{ message }` | 400 validation, 401 wrong password |

All require JWT auth. Operate on `req.user.id` — no ownership check needed.

- `POST` is upsert (saves new or replaces existing). Validates with existing `anthropicKeySchema`.
- `DELETE` is idempotent — 204 even if no key exists.
- `PUT /password` reuses `comparePassword`/`hashPassword` from `password.utils.ts`.

### 3.4 Quiz Generation/Grading Flow Changes

**Before:** Route reads `X-Anthropic-Key` header → passes `anthropicApiKey` to service functions.

**After:** Service layer resolves the key from DB:
- `prepareGeneration` already fetches the user (for `freeTrialUsedAt`). Now also reads `encryptedApiKey` from that query, decrypts inline. The `anthropicApiKey` parameter is removed.
- `prepareGrading`/`prepareRegrade` use a shared private helper `resolveUserApiKey(userId)` that fetches + decrypts. Called only when needed (`!isFreeTrial && hasFreeText`). The `anthropicApiKey` parameter is removed.
- `readAnthropicKey()` in `quiz.routes.ts` is deleted. Routes no longer touch API keys.

### 3.5 `getMe` Response Change

`GET /api/auth/me` adds `hasApiKey: boolean` (derived from `encryptedApiKey !== null`). Session dashboard and profile page use this for UI state.

### 3.6 Frontend Changes

**New RTK Query slice:** `packages/client/src/api/user.api.ts`
- `useGetApiKeyStatusQuery()`, `useSaveApiKeyMutation()`, `useDeleteApiKeyMutation()`
- `useUpdateProfileMutation()`, `useChangePasswordMutation()`

**New profile page:** `packages/client/src/pages/profile/ProfilePage.tsx`
- Username: editable field + save
- Password: current + new + confirm form
- API key: masked hint when saved, save form when not, delete button with confirmation

**Session dashboard:** When `hasUsedFreeTrial && !hasApiKey` → message with link to `/profile` (replaces inline `ApiKeyInput`).

**Navigation:** Profile link added to `HomeDashboardPage` top bar (next to logout).

**Removed:**
- `apiKeyStore.ts` + `apiKeyStore.test.ts` — replaced by server storage + RTK Query
- `extraHeaders` param in `useSSEStream.ts` — no longer needed
- API key header logic in `useQuizGeneration.ts`

### 3.7 Shared Package

**New file:** `packages/shared/src/schemas/user.schema.ts`
- `saveApiKeySchema`, `apiKeyStatusResponseSchema`, `updateProfileSchema`, `changePasswordSchema`
- `saveApiKeySchema` wraps existing `anthropicKeySchema` — no duplication

`userResponseSchema` in `auth.schema.ts` adds `hasApiKey: z.boolean()`.

### Design Decisions

| Decision | Chosen | Rejected | Reasoning |
|---|---|---|---|
| Encryption | AES-256-GCM, shared key in env var | Bcrypt (irreversible — can't send key to Anthropic SDK), per-user HKDF derivation (marginal benefit, same threat model) | Server must recover plaintext. 256-bit key is computationally impossible to brute force. |
| Storage format | Single column `base64(iv \|\| authTag \|\| ciphertext)` | Three separate columns | Industry standard (AWS KMS, Google Tink). One value, always consistent. |
| Key resolution | Service layer (quiz.service) | Route handler | Routes stay thin. Quiz service already owns trial logic — should also own key resolution. |
| Endpoint grouping | New `user.routes.ts` + `user.service.ts` | Extend `auth.routes.ts` | Auth = authentication flows. Profile/keys = account management. Separate domains. |
| Delete behavior | 204 idempotent | 404 if missing | REST convention. Simpler client logic. |
| Profile page | New `/profile` route | Inline on session dashboard | API key is user-level state, not session-level. Cleaner separation. |

## 4. Blast Radius

### Files created

| File | Purpose |
|---|---|
| `packages/server/src/utils/encryption.utils.ts` | AES-256-GCM encrypt/decrypt |
| `packages/server/src/routes/user.routes.ts` | 5 user endpoints |
| `packages/server/src/services/user.service.ts` | API key + profile + password logic |
| `packages/shared/src/schemas/user.schema.ts` | Zod schemas for user endpoints |
| `packages/client/src/api/user.api.ts` | RTK Query slice |
| `packages/client/src/pages/profile/ProfilePage.tsx` | Profile page |
| `packages/client/src/pages/profile/ProfilePage.module.css` | Profile layout |

### Files modified

| File | Change |
|---|---|
| `packages/server/prisma/schema.prisma` | Add `encryptedApiKey`, `apiKeyHint` to User |
| `packages/server/src/config/env.ts` | Add `API_KEY_ENCRYPTION_KEY` |
| `packages/server/src/services/quiz.service.ts` | Read key from DB, remove `anthropicApiKey` params, add `resolveUserApiKey` helper |
| `packages/server/src/routes/quiz.routes.ts` | Remove `readAnthropicKey`, simplify handlers |
| `packages/server/src/routes/index.ts` | Register `userRouter` at `/users` |
| `packages/server/src/services/auth.service.ts` | Add `hasApiKey` to getMe |
| `packages/shared/src/schemas/auth.schema.ts` | Add `hasApiKey` to `userResponseSchema` |
| `packages/shared/src/index.ts` | Export new schemas and types |
| `packages/client/src/App.tsx` | Add `/profile` route |
| `packages/client/src/hooks/useQuizGeneration.ts` | Remove API key header logic |
| `packages/client/src/hooks/useSSEStream.ts` | Remove `extraHeaders` parameter |
| `packages/client/src/pages/sessions/SessionDashboardPage.tsx` | Replace `ApiKeyInput` with link to profile |
| `packages/client/src/components/quiz/QuizPreferences.tsx` | Derive `isByok` from `hasUsedFreeTrial && hasApiKey` — users who have a saved key but haven't yet consumed their free trial still see the free-trial UI |
| `packages/client/src/pages/dashboard/HomeDashboardPage.tsx` | Add profile link to top bar |

### Files deleted

| File | Reason |
|---|---|
| `packages/client/src/store/apiKeyStore.ts` | Replaced by server storage + RTK Query |
| `packages/client/src/store/apiKeyStore.test.ts` | Tests for deleted module |
| `packages/client/src/components/quiz/ApiKeyInput.tsx` | Replaced by profile page API key section |

### Tests affected

| File | Change needed |
|---|---|
| `packages/server/src/services/__tests__/quiz.service.test.ts` | Update: `anthropicApiKey` param removed, mock encrypted key on user |
| `packages/server/src/routes/__tests__/quiz.routes.test.ts` | Remove header validation tests (moved to user routes) |
| `packages/client/src/components/quiz/QuizPreferences.test.tsx` | Update `isByok` source |

### Features unaffected

Quiz taking, results, session CRUD, material upload, auth (login/register/verify/reset), MCQ grading, rate limiting, CSP, error middleware.

## 5. Migration & Rollback

### Migration

- **Strategy:** Additive database change. Two nullable columns on `users`. No data migration — ephemeral store has nothing to migrate.
- **Sequence:** Prisma migration → deploy backend → deploy frontend.
- **Backwards compatibility:** Backend can deploy before frontend. Old frontend still sends header — server ignores it (reads from DB, finds no key). New frontend removes header sending.

### Rollback

- **Trigger:** Encryption/decryption failures, key corruption, or security incident.
- **Steps:** Revert frontend and backend. Nullable columns can stay or be dropped.
- **Data:** Saved keys are lost on rollback. Users re-enter via restored ephemeral flow. Acceptable — keys are the user's own, not generated by us.

## 6. Acceptance Criteria

### Success

1. **Given** a user saves an API key via profile **When** they refresh and generate a quiz **Then** it works without re-entering the key
2. **Given** a saved key **When** querying `users` table directly **Then** `encrypted_api_key` contains base64 ciphertext, not plaintext
3. **Given** a user with a saved key **When** they visit profile **Then** they see `sk-ant-...xxxx` and a delete button, never the full key
4. **Given** a user deletes their key **When** they try to generate a quiz **Then** they're prompted to save a key in their profile
5. **Given** a POST to `/api/users/api-key` with invalid format **Then** 400 validation error
6. **Given** a DELETE when no key exists **Then** 204 (idempotent)
7. **Given** a user updates username on profile **Then** change persists and reflects across the app
8. **Given** correct current password **When** changing password **Then** new password works for login
9. **Given** wrong current password **When** changing password **Then** 401 error

### Regression

10. **Given** a free-trial user **When** generating a quiz **Then** server key used — same as before
11. **Given** a BYOK user with free-text quiz **When** submitting **Then** grading uses decrypted key from DB
12. **Given** a BYOK MCQ-only quiz **When** submitted **Then** grading succeeds without key
13. **Given** any request with `X-Anthropic-Key` header **Then** pino-http still redacts it

### Rollback

14. **Given** rollback to pre-RFC code **When** user visits site **Then** ephemeral flow restored, user re-enters key

## 7. TDD Updates Required (not implementation scope)

- **Section 3.5 (Project Structure):** Add `user.routes.ts`, `user.service.ts`, `encryption.utils.ts`, `user.schema.ts`, `user.api.ts`, profile page files
- **Section 4.2 (Users table):** Add `encrypted_api_key` (TEXT, nullable) and `api_key_hint` (VARCHAR(20), nullable) columns
- **Section 4.3 (Prisma Schema):** Add two fields to User model
- **Section 5 (API Contracts):** Add 5 user endpoints. Remove `X-Anthropic-Key` header from generation/grading/regrade. Add `hasApiKey` to `GET /api/auth/me` response
- **Section 6.4 (Security Measures):** Add AES-256-GCM encryption at rest for API keys. Document `API_KEY_ENCRYPTION_KEY` env var
