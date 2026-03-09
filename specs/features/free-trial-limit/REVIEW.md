# Review: free-trial-limit
**Date**: 2026-03-08
**Spec file**: RFC.md
**Overall result**: Deviations found (2) — both resolved

## Deviations

### 1. auth.service.test.ts not updated for hasUsedFreeTrial
- **Section**: Section 4 (Blast Radius) — "Tests affected: auth.service.test.ts — updated getMe response shape"
- **Type**: Code is wrong
- **Spec says**: auth.service.test.ts should be updated for the new getMe response shape
- **Code does**: mockUser was missing freeTrialUsedAt field, and the getMe test expectation didn't include hasUsedFreeTrial. Double bug: (1) .toEqual() fails because actual response has hasUsedFreeTrial but expected doesn't, (2) mockUser without freeTrialUsedAt causes undefined !== null to evaluate to true, making hasUsedFreeTrial incorrectly true
- **Root cause**: Test file wasn't touched during implementation. Missing env vars prevented running these tests locally, so the failure wasn't caught.
- **Resolution**: Added freeTrialUsedAt: null to mockUser, added hasUsedFreeTrial: false to getMe assertion, added new test for hasUsedFreeTrial:true when freeTrialUsedAt is set.

### 2. executeGeneration $transaction assertion too loose
- **Section**: Section 6 (Acceptance Criteria) — AC2: "freeTrialUsedAt is set"
- **Type**: Code is wrong (test gap)
- **Spec says**: "Given a new user When they generate a quiz Then exactly 5 questions are generated and freeTrialUsedAt is set"
- **Code does**: The $transaction test used expect.arrayContaining([expect.objectContaining({})]) which passes for any non-empty array — doesn't verify freeTrialUsedAt is actually set
- **Root cause**: Original test asserted on prisma.quizAttempt.update directly. When refactored to $transaction for atomicity, the assertion was weakened.
- **Resolution**: Strengthened assertion to verify transaction array has length 2 (quizAttempt update + user update). Renamed test to reflect both operations.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|------------|--------|--------|
| AC1: New user sees locked count (5) and trial note | Yes | No (frontend — not in RFC test scope) | Pass |
| AC2: Generation produces 5 questions and sets freeTrialUsedAt | Yes | Yes (quiz.service.test.ts — questionCount:5 + $transaction length:2) | Pass |
| AC3: Used trial → 403 ForbiddenError | Yes | Yes (quiz.service.test.ts — "throws ForbiddenError when free trial has already been used") | Pass |
| AC4: Used trial → "trial used" message on dashboard | Yes | No (frontend — not in RFC test scope) | Pass |
| AC5: Failed generation → trial not consumed | Yes | Yes (implicitly — error path tests show $transaction not called on LLM failure) | Pass |
| AC6: Existing users (pre-migration) → trial available | Yes | No (deployment concern, not unit testable) | Pass |

## Lessons Learned

- When adding a field to a service response, search for ALL test files that assert on that response shape — not just the service's own test file. The auth.service.test.ts was explicitly listed in the RFC's blast radius but was still missed.
- When refactoring from a direct Prisma call to a $transaction, the test assertion must be updated to verify the transaction contents, not just that $transaction was called. Weakening assertions during refactoring defeats the purpose of the test.
- Test files that can't run locally (due to missing env vars) are a blind spot. Consider fixing the env-var dependency in auth.service.test.ts and token.utils.test.ts so they can run in the same CI-free local flow as other service tests.

## TDD Updates Required

- **TDD Section 4 (Database Schema):** Add freeTrialUsedAt DateTime? to User model
- **TDD Section 5 (API Contracts):** Add hasUsedFreeTrial: boolean to GET /api/auth/me response
- **TDD Section 7 (Error Handling):** Add TRIAL_EXHAUSTED error code (403) for quiz generation
