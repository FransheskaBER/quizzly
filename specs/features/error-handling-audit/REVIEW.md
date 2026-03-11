# Review: Error Handling Audit
**Date**: 2026-03-10
**Spec file**: RFC.md
**Overall result**: Deviations found — all resolved

## Deviations

### 1. Import ordering violation in auth.service.ts
- **Section**: 3.3 (Auth Service — Await Email Calls)
- **Type**: Code is wrong
- **Spec says**: Add `pino`, `Sentry`, and `logger` to auth.service.ts (no ordering specified).
- **Code does**: `const logger = pino(...)` was placed on line 20, splitting the import block. `@skills-trainer/shared` imports on lines 21-35 appeared after the constant, violating coding-conventions.md (file structure: Imports first, then Constants).
- **Root cause**: During implementation, the new imports and constant were inserted near the existing `sendVerificationEmail` import rather than respecting the canonical file ordering (external packages -> shared package -> internal modules -> constants).
- **Resolution**: Reordered imports to: external (`pino`) -> shared (`@skills-trainer/shared` values + types) -> internal (`prisma`, `Sentry`, utils, services). Moved `const logger` below all imports.

### 2. Missing Sentry failure-path tests for quiz.service.ts
- **Section**: 6 (Acceptance Criteria 4, 5)
- **Type**: Code is wrong
- **Spec says**: Criteria 4 and 5 require Sentry capture on Prisma failures for `startedAt` update, grading timeout, and grading error recovery.
- **Code does**: Source code correctly calls `Sentry.captureException` in all three blocks, but the test file had no Sentry mock and no tests verifying these calls.
- **Root cause**: The quiz test file (`quiz.service.test.ts`) never imported or mocked `Sentry` prior to this RFC. When tests were updated to change `.catch()` to `try/catch`, the Sentry assertion step was missed.
- **Resolution**: Added `vi.mock('../../config/sentry.js')` + `import { Sentry }` to quiz.service.test.ts. Added 3 new tests:
  - `captures to Sentry when startedAt update fails` (criterion 4)
  - `captures grading failure to Sentry when Prisma throws` (criterion 5)
  - `captures error recovery failure to Sentry when status update also fails` (criterion 5)

### 3. Missing EMAIL_FROM not-configured regression test
- **Section**: 6 (Acceptance Criterion 10)
- **Type**: Code is wrong
- **Spec says**: Criterion 10 — given `EMAIL_FROM` not configured, email function returns without throwing.
- **Code does**: Implementation correctly preserves the early return, but no test covered it.
- **Root cause**: The existing email.service.test.ts mocks `env.EMAIL_FROM` as `'noreply@test.com'` globally. No test overrode this to verify the not-configured path.
- **Resolution**: Added 2 tests to email.service.test.ts:
  - `sendVerificationEmail when EMAIL_FROM is not configured > warns and returns without sending or throwing`
  - `sendPasswordResetEmail when EMAIL_FROM is not configured > warns and returns without sending or throwing`

### 4. Missing client error-path tests (criteria 6, 7, 8)
- **Section**: 6 (Acceptance Criteria 6, 7, 8)
- **Type**: Spec is outdated
- **Spec says**: Criteria 6-8 require `console.error` + `Sentry.captureException` for client error paths.
- **Code does**: Source code correctly implements all three. No client component tests exist for these paths.
- **Root cause**: RFC Section 4 (Tests to Update) lists only server test files. Client component tests require React Testing Library infrastructure that doesn't exist yet for these files (`MaterialUploader.tsx`, `LoginPage.tsx`, `auth.api.ts`). The RFC implicitly assumed these would be server-side testable.
- **Resolution**: Accepted as spec gap. Client error paths are manually verifiable and the source code is correct. Component tests for these files are out of scope for this RFC — they should be added when component test infrastructure is established.

### 5. Missing 401-skip regression test for auth.api.ts (criterion 11)
- **Section**: 6 (Acceptance Criterion 11)
- **Type**: Spec is outdated
- **Spec says**: Criterion 11 — given 401 on `getMe`, `baseQueryWithAuth` dispatches `logout()` unchanged.
- **Code does**: Implementation correctly skips Sentry for 401 errors. No test exists.
- **Root cause**: Same as deviation 4 — testing RTK Query `onQueryStarted` hooks requires a full Redux store test setup that doesn't exist for this file. RFC Section 4 doesn't list a client test file for this.
- **Resolution**: Accepted as spec gap. The conditional logic (`isUnauthorized` check) is straightforward and manually verifiable. A dedicated RTK Query hook test would be appropriate when client test infrastructure expands.

## Acceptance Criteria Results

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| 1 | Resend error during signup -> 502 EMAIL_DELIVERY_ERROR, Sentry, account exists | Yes | Yes (auth.service.test.ts, auth.routes.test.ts) | Pass |
| 2 | Resend error during resend-verification -> 502 | Yes | Yes (auth.service.test.ts) | Pass |
| 3 | Resend error during forgot-password -> generic response + Sentry | Yes | Yes (auth.service.test.ts, auth.routes.test.ts) | Pass |
| 4 | Prisma failure on startedAt -> Sentry + quiz still returned | Yes | Yes (quiz.service.test.ts) | Pass |
| 5 | Prisma failure on grading recovery -> Sentry | Yes | Yes (quiz.service.test.ts) | Pass |
| 6 | Client material delete failure -> console.error + Sentry | Yes | No (no component test infra) | Gap |
| 7 | Client resend failure -> console.error + Sentry | Yes | No (no component test infra) | Gap |
| 8 | Client non-401 getMe failure -> console.error + Sentry | Yes | No (no component test infra) | Gap |
| 9 | Successful email delivery -> behavior unchanged | Yes | Yes (email.service.test.ts, auth.service.test.ts) | Pass |
| 10 | EMAIL_FROM not configured -> warn + return | Yes | Yes (email.service.test.ts) | Pass |
| 11 | 401 on getMe -> logout unchanged | Yes | No (no RTK Query hook test infra) | Gap |
| 12 | Successful quiz grading -> flow unchanged | Yes | Yes (quiz.service.test.ts) | Pass |

## Lessons Learned

- **Import ordering must be verified after adding new imports.** When inserting multiple imports + constants into an existing file, validate that the final ordering follows the file structure convention (Imports -> Constants -> Types -> Helpers -> Exports). The violation was caused by inserting `const logger` between two import groups.
- **New mock dependencies must be added when testing new code paths.** When a source file starts calling a new dependency (e.g., `Sentry`), the corresponding test file must add a mock for it — even if the existing tests still pass without the mock.
- **RFC "Tests to Update" section should list all test files affected, including client.** Criteria 6-8 and 11 specify client behaviors but the blast radius section only lists server test files, creating an implicit gap.

## TDD Updates Required

- **TDD Section 7 (Error Handling)**: Add `EmailDeliveryError` (502, `EMAIL_DELIVERY_ERROR`) to the error class inventory.
- **TDD Section 3 or 7**: Add project-wide rule: "No fire-and-forget patterns. All async operations must be awaited with try/catch."
