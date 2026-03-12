# Review: free-trial-limit
**Date**: 2026-03-12
**Spec file**: RFC.md
**Overall result**: Deviations found (3) — resolved via spec classification + code fixes

## Deviations

### 1) RFC non-goal "BYOK implementation" is outdated
- **Section**: Section 2 (Goals and Non-Goals)
- **Type**: Spec is outdated
- **Spec says**: BYOK is out of scope for this RFC stage.
- **Code does**: post-trial generation is allowed when a saved user API key exists; blocked only when trial is used and no key is saved.
- **Root cause**: BYOK stage-2 work landed after this RFC and behavior now spans both stages.
- **Resolution**: keep implementation; treat RFC section as historical/outdated.

### 2) prepareGeneration error contract in RFC is outdated
- **Section**: Section 3 (Detailed Design)
- **Type**: Spec is outdated
- **Spec says**: if `freeTrialUsedAt` is non-null, throw `ForbiddenError`.
- **Code does**: throws `TrialExhaustedError` (`TRIAL_EXHAUSTED`) only when trial is used and no saved API key exists.
- **Root cause**: error contract evolved to support BYOK continuation after trial.
- **Resolution**: keep implementation; RFC wording should reflect current contract.

### 3) Free-trial output was not strictly enforced to exactly 5 MCQ
- **Section**: Section 6 (Acceptance Criteria AC2)
- **Type**: Code is wrong
- **Spec says**: free-trial generation yields exactly 5 multiple-choice questions and marks trial used only on success.
- **Code did**: accepted partial LLM output and persisted fewer questions.
- **Root cause**: generic "partial output is acceptable" generation behavior conflicted with strict free-trial contract.
- **Resolution**: fixed:
  - `executeGeneration` now validates free-trial output is exactly 5 and all MCQ.
  - invalid free-trial output fails generation (SSE error, no complete).
  - failed attempt cleanup deletes `GENERATING` attempt so immediate retry is possible.
  - trial consumption remains success-only.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|------------|--------|--------|
| AC1: New user sees locked count (5), locked MCQ format, trial note | Yes | Yes (`QuizPreferences.test.tsx`, `SessionDashboardPage.test.tsx`) | Pass |
| AC2: New user generation yields exactly 5 MCQ and sets `freeTrialUsedAt` | Yes | Yes (`quiz.service.test.ts`, `quiz.routes.test.ts`) | Pass |
| AC3: Used trial user gets 403 message requiring own key | Yes | Yes (`quiz.service.test.ts`, `quiz.routes.test.ts`) | Pass |
| AC4: Used trial user sees "trial used" message instead of form | Yes | Yes (`SessionDashboardPage.test.tsx`) | Pass |
| AC5: Failed generation does not consume trial; retry still works | Yes | Yes (`quiz.routes.test.ts` retry path + freeTrialUsedAt null assertion) | Pass |
| AC6: Existing pre-migration users still have one trial | Yes | Partially (migration shape verified; no dedicated migration regression test) | Pass |
| AC7: Client-submitted `free_text`/`mixed` still enforced to MCQ in free trial | Yes | Partial (`free_text` explicitly tested; service-level forced-MCQ behavior covered) | Pass |

## Lessons Learned

- When an acceptance criterion uses "exactly", enforce cardinality and type at the service boundary rather than relying on prompt compliance.
- For SSE generation failures, failed-attempt cleanup must be explicit when no failed status exists, otherwise concurrency guards can block retries.
- RFCs that are stage-based should be updated or annotated once cross-stage behavior lands to prevent false-positive audit deviations.

## TDD Updates Required

- No new TDD updates required from this review. Required items from the RFC (`freeTrialUsedAt`, `hasUsedFreeTrial`, `TRIAL_EXHAUSTED`) are already present in `specs/TDD.md`.
