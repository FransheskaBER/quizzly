# RFC: Replace quiz_attempts.is_free_trial with key_source

**Date**: 2026-03-12
**Status**: Draft
**Type**: Refactor
**TDD Updates Required**: Yes

---

## 1. Context

### What exists today

- `quiz_attempts.is_free_trial` (`BOOLEAN`, default `false`) — `true` = server key used (free trial), `false` = user's own key (BYOK).
- Set in `quiz.service.ts:executeGeneration()` during quiz creation.
- Read in `quiz.service.ts:prepareGrading()` and `prepareRegrade()` to determine if the user's saved API key is needed for free-text grading.
- `users.free_trial_used_at` (timestamp, nullable) determines free trial eligibility — unrelated to this column and untouched by this RFC.

### Why it needs to change

The boolean encodes key source indirectly — you must reason backwards (`true` means server key). A self-describing string value (`SERVER_KEY` / `USER_KEY`) makes the data model readable and simplifies debugging (e.g., detecting non-5-MCQ quizzes that used the server key).

---

## 2. Goals and Non-Goals

### Goals

1. Replace `quiz_attempts.is_free_trial` (boolean) with `quiz_attempts.key_source` (varchar) — values `SERVER_KEY` or `USER_KEY`.
2. Maintain all existing behavior — grading, generation, free trial enforcement work identically.
3. Backfill all existing rows: `is_free_trial = true` → `SERVER_KEY`, `false` → `USER_KEY`.
4. Remove `is_free_trial` column after backfill.

### Non-Goals

- Not changing free trial eligibility logic (`users.freeTrialUsedAt` stays as-is).
- Not changing error messages or UX for key-deleted grading scenarios.
- Not adding a third key source value for future tiers.
- Not modifying `users.encrypted_api_key` storage or deletion behavior.

---

## 3. Detailed Design

### Schema change

Remove from `QuizAttempt` model:
```prisma
isFreeTrial Boolean @default(false) @map("is_free_trial")
```

Add:
```prisma
keySource String @map("key_source") @db.VarChar(10)
```

No default value. Must be explicitly set at quiz creation.

### Shared constants

Add to `packages/shared/src/constants/quiz.constants.ts`:
```typescript
export const KeySource = {
  SERVER_KEY: 'SERVER_KEY',
  USER_KEY: 'USER_KEY',
} as const;
```

### Service changes (`quiz.service.ts`)

Three locations:

1. `executeGeneration()` — quiz creation:
   - `isFreeTrial: isFreeTrialGeneration` → `keySource: isFreeTrialGeneration ? KeySource.SERVER_KEY : KeySource.USER_KEY`

2. `prepareGrading()` — grading key resolution:
   - `!attempt.isFreeTrial` → `attempt.keySource === KeySource.USER_KEY`

3. `prepareRegrade()` — regrading key resolution:
   - Same change as grading.

### Design decisions

| Decision | Choice | Rejected | Reasoning |
|---|---|---|---|
| Column type | `VARCHAR(10)` + app constants | Prisma enum | Matches existing pattern for `status`, `difficulty`, `answerFormat` |
| Default value | None | `USER_KEY` default | Every quiz is explicitly generated via one path — no default forces correctness |
| Migration strategy | Single migration (add, backfill, drop) | Two-phase | 30-user MVP, no production traffic concerns |

### What stays the same

- `users.freeTrialUsedAt` — trial eligibility check in `prepareGeneration()`
- `users.encryptedApiKey` / `apiKeyHint` — key storage and deletion
- All error types and messages
- Frontend — `isFreeTrial` is never sent to the client
- All route handlers and middleware

---

## 4. Blast Radius

### Files directly modified

| File | Change |
|---|---|
| `packages/server/prisma/schema.prisma` | Replace `isFreeTrial` with `keySource` |
| `packages/server/prisma/migrations/<new>/migration.sql` | Add `key_source`, backfill, drop `is_free_trial` |
| `packages/server/src/services/quiz.service.ts` | Update 3 locations: create, grade, regrade |
| `packages/server/src/services/__tests__/quiz.service.test.ts` | Update `isFreeTrial` assertions to `keySource` |
| `packages/server/src/__tests__/helpers/quiz.helper.ts` | Add explicit `keySource` when creating quiz attempts |
| `packages/shared/src/constants/quiz.constants.ts` | Add `KeySource` constant |

### Files indirectly affected

None. `isFreeTrial` is not referenced in client, routes, middleware, or other services.

### Features affected

- Quiz generation — writes `keySource` instead of `isFreeTrial`. Same behavior.
- Quiz grading/regrading — reads `keySource` instead of `isFreeTrial`. Same logic.

---

## 5. Migration / Rollback

### Migration

Single migration SQL:
1. `ALTER TABLE quiz_attempts ADD COLUMN key_source VARCHAR(10)`
2. `UPDATE quiz_attempts SET key_source = 'SERVER_KEY' WHERE is_free_trial = true`
3. `UPDATE quiz_attempts SET key_source = 'USER_KEY' WHERE is_free_trial = false`
4. `ALTER TABLE quiz_attempts ALTER COLUMN key_source SET NOT NULL`
5. `ALTER TABLE quiz_attempts DROP COLUMN is_free_trial`

Implementation sequence: migration → schema → shared constants → service → tests → verify.

### Rollback

Reverse migration steps (documented; no rollback migration file for MVP):

1. `ALTER TABLE quiz_attempts ADD COLUMN is_free_trial BOOLEAN`
2. `UPDATE quiz_attempts SET is_free_trial = true WHERE key_source = 'SERVER_KEY'`
3. `UPDATE quiz_attempts SET is_free_trial = false WHERE key_source = 'USER_KEY'`
4. `ALTER TABLE quiz_attempts ALTER COLUMN is_free_trial SET NOT NULL DEFAULT false`
5. `ALTER TABLE quiz_attempts DROP COLUMN key_source`

Data is fully reversible — 1:1 mapping.

---

## 6. Acceptance Criteria

### Success

1. **Given** unused free trial **when** quiz generated **then** `key_source = 'SERVER_KEY'`.
2. **Given** saved API key, trial used **when** quiz generated **then** `key_source = 'USER_KEY'`.
3. **Given** `USER_KEY` quiz with free-text **when** submitted **then** grading uses user's saved key.
4. **Given** `USER_KEY` quiz with free-text, key deleted **when** submitted **then** throws `TrialExhaustedError` (403).
5. **Given** `SERVER_KEY` quiz **when** submitted **then** grading succeeds without user key.
6. **Given** `USER_KEY` MCQ-only quiz **when** submitted **then** grading succeeds without user key.

### Regression

7. **Given** migration complete **then** all `is_free_trial = true` rows → `SERVER_KEY`, `false` → `USER_KEY`.
8. **Given** quiz creation **then** omitting `keySource` causes database error (no default).
9. **Given** `users.freeTrialUsedAt` **then** trial eligibility in `prepareGeneration()` unchanged.
10. **Given** regrading a `USER_KEY` free-text quiz **then** same key resolution as initial grading.

### Rollback

11. **Given** rollback triggered **when** reverse migration runs **then** `is_free_trial` restored correctly from `key_source`.

---

## 7. TDD Updates Required (not implementation scope)

- **TDD Section 4 (Database Schema)**: Replace `is_free_trial BOOLEAN DEFAULT false` with `key_source VARCHAR(10) NOT NULL` (no default). Document valid values: `SERVER_KEY`, `USER_KEY`.
- **TDD Section 5 (API Contracts)**: Verify no API response references `isFreeTrial` (confirmed — none do).
