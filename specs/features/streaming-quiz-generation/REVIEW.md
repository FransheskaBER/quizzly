# Review: Streaming Quiz Generation RFC

**Date**: 2026-03-14
**Spec file**: RFC.md
**Overall result**: All deviations fixed. Most test gaps covered — 19 of 25 acceptance criteria have explicit tests (~36 tests across 6 files). Remaining 6 gaps are integration- or E2E-level.

## Deviations (All Resolved)

### 1. "Start Quiz" button non-functional — `quizAttemptId` missing during generation
- **Status**: FIXED
- **Fix**: Added `generation_started` SSE event, `generationAttemptCreated` Redux action, and provider handling.

### 2. Replacement question uses `runWithRetry` instead of single call
- **Status**: FIXED
- **Fix**: `generateReplacementQuestion()` now uses `callLlmStream` + `parseBlock` directly.

### 3. Missing `questionType` in Sentry `extra` object
- **Status**: FIXED
- **Fix**: Added `questionType` field to `captureMalformedQuestionSentry()` extra object.

### 4. Missing explicit MCQ check for free trial generation
- **Status**: FIXED
- **Fix**: Added `allQuestionsMcq` flag tracking and validation at line 480.

### 5. Missing spinner icon on disabled "Next" button
- **Status**: FIXED
- **Fix**: Added `<LoadingSpinner inline size="sm" />` to the disabled Next button for tiers 1-2.

### 6. Dead code — `useQuizGeneration.ts` not removed
- **Status**: FIXED
- **Fix**: Both `useQuizGeneration.ts` and `useQuizGeneration.test.ts` deleted.

## Acceptance Criteria Results

### Per-Question Streaming (Backend)

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC1 | First question validated/saved/SSE'd within ~5-10s without waiting for rest | Yes | Yes (`streamQuestions.test.ts:92`) | Pass |
| AC2 | Each valid question saved + SSE'd independently, sequential questionNumber | Yes | Yes (`streamQuestions.test.ts:92`) | Pass |
| AC3 | Malformed Q3→ Q4 renumbered to #3, Q5 to #4 (no gap) | Yes | Yes (`streamQuestions.test.ts:137`) | Pass |

### Malformed Question Recovery

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC4 | Single replacement LLM call with topic context | Yes | Yes (`streamQuestions.test.ts:214`) | Pass |
| AC5 | Successful replacement saved with next sequential number + SSE | Yes | Yes (`executeGeneration.streaming.test.ts: AC5`) | Pass |
| AC6 | Failed replacement → `question_failed` SSE + questionCount updated | Yes | Yes (`executeGeneration.streaming.test.ts: AC6`) | Pass |
| AC7 | Free trial fails entirely if any question permanently fails | Yes | Yes (`executeGeneration.streaming.test.ts: AC7`) | Pass |

### Sentry Error Capture

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC8 | Replaced malformed → Sentry warning with all context fields | Yes | Yes (`executeGeneration.streaming.test.ts: AC8`) | Pass |
| AC9 | Replacement failed → Sentry error, attemptNumber: 2 | Yes | Yes (`executeGeneration.streaming.test.ts: AC9`) | Pass |
| AC10 | 2+ permanently failed → Sentry error, threshold_exceeded, high_priority | Yes | Yes (`executeGeneration.streaming.test.ts: AC10`) | Pass |

### Early Quiz Start (Frontend)

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC11 | "Start Quiz" visible during generation with ≥1 question | Yes | No | Gap |
| AC12 | SSE stays alive across navigation (provider wraps routes) | Yes | No | Gap |
| AC13 | "Next" enabled when next question exists | Yes | Yes (`QuizTakingPage.test.tsx`) | Pass |
| AC14 | "Next" disabled with "Preparing next question..." | Yes | Yes (`QuizTakingPage.test.tsx: AC14`) | Pass |
| AC15 | After 5-15s text changes to "Still working on it..." | Yes | Yes (`QuizTakingPage.test.tsx: AC15`) | Pass |
| AC16 | After 15+s text changes + "Save progress" link | Yes | Yes (`QuizTakingPage.test.tsx: AC16`) | Pass |
| AC17 | "Save progress" navigates away, answers saved | Yes | Yes (`QuizTakingPage.test.tsx: AC17`) | Pass |

### Reassuring Note for Failed Questions

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC18 | question_failed → info card (not error-styled) with message | Yes | Yes (`QuizTakingPage.test.tsx: AC18`) | Pass |
| AC19 | Score = (totalScore / actualValid) × 100 | Yes (correct by construction) | No | Gap |

### Page Refresh Resilience

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC20 | Refresh → fetch existing questions from API | Yes | No | Gap |
| AC21 | Detect GENERATING + reconnect to SSE | Yes | No | Gap |
| AC22 | Server restarted → return current state, update IN_PROGRESS | Yes | Yes (`quizReconnect.test.ts: AC22`) | Pass |

### Regression

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| AC23 | All questions valid → behavior identical to current | Yes | Yes (`executeGeneration.streaming.test.ts: AC23`) | Pass |
| AC24 | User waits for completion → same flow as before | Yes | No | Gap |
| AC25 | Grading unchanged | Yes | Existing grading tests | Pass |

## Coverage Summary

- **25 acceptance criteria total**
- **19 tested** (up from 7)
- **6 remaining gaps**: AC11 (Start Quiz button visibility), AC12 (SSE survives navigation), AC19 (score calculation), AC20 (refresh fetch), AC21 (SSE reconnect), AC24 (wait-for-completion flow)
- All remaining gaps are integration- or E2E-level; some require `QuizGenerationProvider.test.tsx` or E2E verification

## New Test Files Created

| File | Tests | Criteria Covered |
|------|-------|-----------------|
| `packages/server/src/services/__tests__/streamQuestions.test.ts` | 13 | AC1, AC2, AC3, AC4 |
| `packages/server/src/services/__tests__/executeGeneration.streaming.test.ts` | 9 | AC5, AC6, AC7, AC8, AC9, AC10, AC23 |
| `packages/server/src/routes/__tests__/quizReconnect.test.ts` | 3 | AC22 |
| `packages/client/src/pages/quiz/QuizTakingPage.test.tsx` (expanded) | 7 | AC13, AC14, AC15, AC16, AC17, AC18 |
| `packages/client/src/store/slices/quizStream.slice.test.ts` | 3 | questionFailed action, failedSlots |

## Lessons Learned

- **Data transport must be explicit in specs**: When a frontend feature requires server-side state not already exposed via an existing API or SSE event, the spec must define the transport. The early-start feature needed `quizAttemptId` during generation, but no SSE event delivered it. Add to `.claude/rules/implementation-mode.md`: "When a frontend feature depends on backend state, verify the spec defines the data path (API endpoint, SSE event, query param). If not, flag as a gap before implementing."
- **"Single call" must specify retry policy**: The RFC said "single LLM call" but didn't explicitly forbid internal retries. When a spec constrains the number of external calls (especially token-consuming ones), it must state whether retry mechanisms like `runWithRetry` are allowed.
- **Validate outputs even when inputs are constrained**: Free trial forces `answerFormat: MCQ` in the request, but the code didn't verify the LLM actually returned MCQ. Defense-in-depth means checking what you got, not trusting what you asked for.
- **Delete replaced files**: When moving logic from one file to another, grep for imports of the original after implementation. If zero consumers remain, delete it. Dead code confuses future implementers.
- **Wrap fake timer advancements in `act()`**: When testing React components with `vi.useFakeTimers()`, always wrap `vi.advanceTimersByTime()` in `act()` to ensure React processes pending state updates before making assertions.

## TDD Updates Required

- **SSE Event Inventory**: Add `generation_started` event type (`{ type: 'generation_started', data: { quizAttemptId } }`) — sent immediately after quiz attempt creation, before streaming begins.
- **Frontend Architecture**: Document that `quizAttemptId` is delivered to the frontend via the `generation_started` SSE event, not the `complete` event. This enables the early-start quiz flow.

## Remaining Test Gaps

| Target file | Criteria to cover |
|-------------|-------------------|
| `packages/client/src/providers/QuizGenerationProvider.test.tsx` (new) | AC11, AC12, AC20, AC21 |
| Backend grading (unit/integration) or E2E | AC19 (score calc), AC24 (wait-for-completion flow) |
