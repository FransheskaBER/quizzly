# Review: byok-api-key

**Date**: 2026-03-09
**Reviewer**: Claude (spec-check)
**Spec**: `specs/features/byok-api-key/SPEC.md`

## Deviations Found

### 1. Wrong error code for trial exhaustion (Code Fix)

- **Spec**: Decision 5 says `ForbiddenError` with code `TRIAL_EXHAUSTED`
- **Code**: Used `ForbiddenError` which hardcodes `code = 'FORBIDDEN'`
- **Fix**: Created `TrialExhaustedError` class in `errors.ts` with `code = 'TRIAL_EXHAUSTED'`, `statusCode = 403`. Used in `prepareGeneration` instead of `ForbiddenError`.

### 2. Error message wording (Spec Update)

- **Spec**: `"Free trial used. Provide your own Anthropic API key."`
- **Code**: `"Free trial generation used. Provide your own Anthropic API key to generate more quizzes."`
- **Decision**: Keep code's clearer wording — it tells the user exactly what to do. Updated spec to match.

### 3. Grading doesn't enforce BYOK key (Code Fix + Spec Gap)

- **Issue**: `prepareGrading` and `prepareRegrade` did not check whether a BYOK quiz requires the user's API key for free-text grading. Post-trial users could grade free-text questions using the server's API key — a cost leak.
- **Root cause**: The spec's data model section said "None" — no column to distinguish free-trial quizzes from BYOK quizzes. Without this, the grading path had no way to know whether the server key or user key should be used.
- **Fix**:
  - Added `is_free_trial` boolean column to `quiz_attempts` table (default `false`)
  - Set `isFreeTrial = true` during free-trial generation in `executeGeneration`
  - Added enforcement in `prepareGrading` and `prepareRegrade`: if `isFreeTrial = false` AND quiz has free-text questions AND no API key provided → throw `TrialExhaustedError`
  - Updated spec Section 5 (Data Model) and Section 6 (Grading contract)

## Acceptance Criteria Results

| AC | Status | Notes |
|---|---|---|
| AC1 | Pass | BYOK generation with user-selected count (5-20) |
| AC2 | Pass | 403 `TRIAL_EXHAUSTED` when trial used + no key (was `FORBIDDEN` — fixed) |
| AC3 | Pass | Grading threads `apiKey` to LLM service |
| AC4 | Pass | Auth error sanitization in `callLlmStream` |
| AC5 | Pass | Header validation returns 400 for malformed key (test added) |
| AC6 | Pass | `apiKeyStore` set/get/clear/subscribe (test added) |
| AC7 | Pass | Free trial ignores user-provided header |
| AC8 | Pass | `QuizPreferences` count input 5-20 with `isByok` (test added) |
| AC9 | Pass | MCQ-only grading succeeds without key |
| AC10 | Pass | pino-http redacts `x-anthropic-key` from logs (test added) |

## Test Coverage Added

| Test File | Tests Added | What They Cover |
|---|---|---|
| `quiz.service.test.ts` | 5 | `TrialExhaustedError` in generation, grading enforcement (BYOK free-text, BYOK MCQ-only, free-trial pass-through), regrade enforcement |
| `quiz.routes.test.ts` | 3 | Route-level header validation (wrong prefix, too short, absent) |
| `apiKeyStore.test.ts` | 5 | Module store: get/set/clear, subscriber notify, unsubscribe |
| `QuizPreferences.test.tsx` | 3 | Free trial hint visibility, count input min/max with `isByok` |
| `app.test.ts` | 3 | Header redaction: removes key, preserves others, no mutation |

## Files Modified

| File | Change |
|---|---|
| `packages/server/src/utils/errors.ts` | Added `TrialExhaustedError` class |
| `packages/server/prisma/schema.prisma` | Added `isFreeTrial` to `QuizAttempt` |
| `packages/server/prisma/migrations/20260308194628_*` | Migration for `is_free_trial` column |
| `packages/server/src/services/quiz.service.ts` | `TrialExhaustedError`, `isFreeTrial` flag, grading/regrade enforcement |
| `packages/server/src/app.ts` | Extracted `redactSensitiveHeaders` as named export |
| `packages/server/src/services/__tests__/quiz.service.test.ts` | Updated error expectations + 5 new tests |
| `packages/server/src/routes/__tests__/quiz.routes.test.ts` | 3 new AC5 tests |
| `packages/server/src/app.test.ts` | New — 3 AC10 tests |
| `packages/client/src/store/apiKeyStore.test.ts` | New — 5 AC6 tests |
| `packages/client/src/components/quiz/QuizPreferences.test.tsx` | New — 3 AC8 tests |
| `packages/client/vitest.config.ts` | Added `@` resolve alias, test setup file |
| `packages/client/src/test-setup.ts` | New — jest-dom matchers + RTL cleanup |
| `specs/features/byok-api-key/SPEC.md` | Updated Decision 5, Data Model, error message, grading contract |

## Lessons Learned

1. **Create dedicated error classes for distinct error codes.** The spec defined `TRIAL_EXHAUSTED` as the error code, but the implementation used `ForbiddenError` which hardcodes `FORBIDDEN`. When a spec defines a custom error code, always create a matching error class — don't reuse a generic one that produces a different code.

2. **Track free-trial vs BYOK at the data level.** Runtime-only checks (checking `freeTrialUsedAt` on the user) are insufficient when the grading path needs to know which key to use. A boolean flag on the quiz attempt itself (`is_free_trial`) is the correct approach — it makes each quiz self-describing.

3. **Error messages should be actionable.** The code's message ("Free trial generation used. Provide your own Anthropic API key to generate more quizzes.") was better than the spec's ("Free trial used. Provide your own Anthropic API key.") because it tells the user exactly what happened and what to do next.

4. **Spec data model sections must account for all enforcement paths.** The original spec said "None" for data model changes, but grading enforcement requires distinguishing quiz types. Always trace the full request lifecycle (generation → grading → regrade) when designing the data model.
