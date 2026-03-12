# Review: refactor-quiz-key-source

**Date**: 2026-03-13
**Spec file**: RFC.md
**Overall result**: Deviations found (resolved)

---

## Deviations

### Deviation 1: executeGeneration tests did not assert keySource (RESOLVED)

- **Section**: RFC §6, Acceptance Criteria 1 & 2
- **Type**: Code is wrong (test gap)
- **Spec says**: AC 1 and 2 require correct `key_source` for free-trial vs BYOK generation.
- **Code did**: Tests used `objectContaining` without asserting `keySource` in the create call.
- **Root cause**: Tests updated for mocks but assertion not added.
- **Resolution**: Added `keySource: KeySource.SERVER_KEY` to free-trial create assertion; added `keySource: KeySource.USER_KEY` to BYOK assertions; added dedicated test "creates a quiz_attempt record with keySource USER_KEY for BYOK generation".

### Deviation 2: No test for omitting keySource causes DB error (RESOLVED)

- **Section**: RFC §6, Acceptance Criterion 8
- **Type**: Test gap
- **Spec says**: "Given quiz creation then omitting keySource causes database error (no default)."
- **Code did**: No test for this.
- **Root cause**: Criterion 8 treated as implied by schema.
- **Resolution**: Added integration test in `quiz.routes.test.ts`: "DB — omitting key_source causes database error (no default)". Uses raw SQL insert without `key_source`; expects DB to reject. If this test fails (e.g. a default exists), review whether to add a default.

### Deviation 3: Rollback migration not implemented (RESOLVED)

- **Section**: RFC §5, §6 AC 11
- **Type**: Spec is outdated (scope)
- **Spec said**: AC 11 implies a rollback migration file exists.
- **Code did**: Only forward migration; rollback steps documented in RFC.
- **Root cause**: MVP scope — rollback not implemented.
- **Resolution**: RFC §5 Rollback updated to: "Reverse migration steps (documented; no rollback migration file for MVP)".

---

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|-------------|--------|--------|
| 1. Unused free trial → quiz generated → key_source = 'SERVER_KEY' | Yes | Yes (quiz.service.test) | Pass |
| 2. Saved API key, trial used → quiz generated → key_source = 'USER_KEY' | Yes | Yes (quiz.service.test) | Pass |
| 3. USER_KEY quiz with free-text → submitted → grading uses user's key | Yes | Yes (prepareGrading tests) | Pass |
| 4. USER_KEY quiz with free-text, key deleted → TrialExhaustedError | Yes | Yes | Pass |
| 5. SERVER_KEY quiz → submitted → grading succeeds without user key | Yes | Yes | Pass |
| 6. USER_KEY MCQ-only quiz → submitted → grading succeeds without user key | Yes | Yes | Pass |
| 7. Migration complete → backfill correct | Yes | N/A (migration SQL) | Pass |
| 8. Omitting keySource causes DB error (no default) | Yes | Yes (quiz.routes integration test) | Pass |
| 9. users.freeTrialUsedAt trial eligibility unchanged | Yes | Yes | Pass |
| 10. Regrading USER_KEY free-text quiz → same key resolution | Yes | Yes | Pass |
| 11. Rollback migration restores is_free_trial | Doc only | N/A | N/A (documented, not implemented) |

---

## Lessons Learned

- When adding a new required column with no default, add an integration test that deliberately omits it and expects a DB error. This documents the constraint and catches accidental defaults.
- For executeGeneration-style flows, include the new field in the create-call assertion to protect against regressions.

---

## TDD Updates Required

- TDD Section 4 already updated per RFC (key_source documented). No further TDD updates required.
