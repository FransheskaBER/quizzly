# Deferred Code Review Issues — PR #81

Issues scored 50-75 confidence (below the 80 threshold), plus additional findings from the code review that were not scored but worth addressing.

---

## 1. Redux state not reset on unmount (Score: 75)

**File:** `packages/client/src/providers/QuizGenerationProvider.tsx` (unmount cleanup effect)

**Problem:** `QuizGenerationProvider` does not dispatch `generationReset()` on unmount. The deleted `useQuizGeneration` hook did. Without it, if a user navigates away during generation and navigates to a different session, the Redux slice retains `status: 'generating'` and stale questions, preventing reconnection for the new session.

**Suggested fix:** Add `dispatch(generationReset())` to the unmount cleanup effect, or reset only when the `sessionId` changes.

---

## 2. Reconnect write-after-end race condition (Score: 75)

**File:** `packages/server/src/services/quiz.service.ts` (`executeReconnect`)

**Problem:** After the polling interval resolves and the route calls `res.end()`, `executeGeneration` may still hold a reference to the writer in the `writers` Set. The `clientConnected` guard doesn't help because `clientConnected` is still `true` (the server called `res.end()`, not the client disconnecting). Could cause a Node.js "write after end" error.

**Suggested fix:** Set `clientConnected = false` explicitly before calling `res.end()` in the route handler, or have `executeReconnect` remove the writer from the generation's `writers` Set before resolving.

---

## 3. Reconnect dispatches `generationStarted()` which nullifies `quizAttemptId` (Score: 75)

**File:** `packages/client/src/providers/QuizGenerationProvider.tsx` (reconnect useEffect)

**Problem:** On reconnect, `dispatch(generationStarted(questionCount))` sets `quizAttemptId = null` in the Redux slice. The ID is already known (`generatingAttempt.id`). Until the SSE `generation_started` event arrives and dispatches `generationAttemptCreated`, there's a race window where the "Start Quiz" button is suppressed because it requires a truthy `quizAttemptId`.

**Suggested fix:** Dispatch `generationAttemptCreated(generatingAttempt.id)` immediately after `generationStarted` in the reconnect effect.

---

## 4. New test files placed in `__tests__/` instead of co-located (Score: 75)

**Files:**
- `packages/server/src/routes/__tests__/quizReconnect.test.ts`
- `packages/server/src/services/__tests__/executeGeneration.streaming.test.ts`
- `packages/server/src/services/__tests__/streamQuestions.test.ts`

**Problem:** Coding conventions say all new test files must be co-located next to source files (`filename.test.ts`). The migration note allows existing tests in `__tests__/` to stay, but new ones must follow the co-located pattern.

**Suggested fix:** Move to `packages/server/src/routes/quizReconnect.test.ts`, etc.

---

## 5. `question_failed` slot number can exceed committed `questionCount` (Score: 50)

**File:** `packages/server/src/services/quiz.service.ts` (lines ~447 and ~495)

**Problem:** When a question permanently fails, SSE sends `questionNumber = questionsGenerated + permanentlyFailed`, but the DB commits `questionCount = questionsGenerated`. If 4 succeed and 1 fails, SSE says question 5 but DB says only 4 questions. The current frontend handles this correctly via `trailingFailedSlots` (fixed in this PR), but the data contract is inconsistent.

**Suggested fix:** Either include permanently failed slots in `questionCount`, or document the intentional discrepancy.

---

## 6. `captureMalformedQuestionSentry` uses `Sentry.captureException` instead of `captureExceptionOnce` (Score: 50)

**File:** `packages/server/src/services/quiz.service.ts` (line ~217)

**Problem:** Every other `captureException` call in the codebase was migrated to `captureExceptionOnce` in commit `d492bab` to prevent duplicates. This helper creates a fresh `Error` each time (so dedup wouldn't fire anyway), but the pattern inconsistency makes the code harder to audit.

**Suggested fix:** Use `captureExceptionOnce` for consistency.

---

## 7. Reconnect seeding race between `questionsBatchReceived` and SSE flush (Score: 50)

**File:** `packages/client/src/providers/QuizGenerationProvider.tsx` (reconnect effect)

**Problem:** On reconnect, the client receives existing questions twice: once from `useGetQuizQuery` (seeded via `questionsBatchReceived`) and once from SSE `question` events. The dedup in the reducer (`existingIds` Set) handles this, but only if the seed dispatch happens before the SSE flush. Since React renders are async and the flush interval fires every 300ms, there's a race window.

**Suggested fix:** Delay `start()` (SSE connection) until after the seed dispatch has been processed, or add a guard in the flush to wait for seeding.

---

## 8. `.saveLink` CSS visual properties in page-level CSS (Score: 100 — FIXED)

Already addressed in this commit.

---

## Additional Findings (Not Scored — from spec compliance and history review)

---

## 9. `executeGeneration` function exceeds 30-line orchestration limit

**File:** `packages/server/src/services/quiz.service.ts` (`executeGeneration`)

**Rule:** coding-conventions.md — "Orchestration functions: 30 lines max. If longer, extract steps into named helper functions."

**Problem:** The `executeGeneration` function body is 100+ lines after the streaming additions: Phase 1 streaming (~20 lines), Phase 2 malformed recovery loop (~50 lines), threshold Sentry check (~15 lines), free trial validation, and the commit transaction. The malformed recovery loop in particular should be extracted into a named helper like `recoverMalformedSlots`.

---

## 10. `streamQuestions` function exceeds 30-line orchestration limit

**File:** `packages/server/src/services/llm.service.ts` (`streamQuestions`)

**Rule:** coding-conventions.md — "Orchestration functions: 30 lines max."

**Problem:** The `streamQuestions` function spans ~130 lines. The inner character-by-character brace-depth parsing loop alone is 50+ lines. The inner parsing logic should be extracted into a named helper like `parseStreamingChunk` or `processCharacter`.

---

## 11. `saveAndStreamQuestion` exceeds 30-line orchestration limit

**File:** `packages/server/src/services/quiz.service.ts` (`saveAndStreamQuestion`)

**Rule:** coding-conventions.md — "Orchestration functions: 30 lines max."

**Problem:** ~45 lines. Saves to DB (question.create + answer.create), then conditionally sends two SSE events to each writer.

---

## 12. `system.prompt.ts` "WHEN IT'S USED" comment is outdated

**File:** `packages/server/src/prompts/generation/system.prompt.ts` (lines 18-20)

**Comment says:**
```
* WHEN IT'S USED:
* Called by streamQuestions() in llm.service.ts immediately before the API
* call — every time a user clicks "Generate Quiz."
```

**Problem:** The PR adds `generateReplacementQuestion()` to `llm.service.ts`, which also calls `buildGenerationSystemPrompt()`. The comment only mentions `streamQuestions()` as the caller. It should also mention `generateReplacementQuestion()`.

---

## 13. Orphaned JSDoc block on `prepareGeneration`

**File:** `packages/server/src/services/quiz.service.ts` (lines 95-100)

**Problem:** Two back-to-back JSDoc blocks with no code between them:
```typescript
/**
 * Pre-stream checks for quiz generation.
 * Throws AppError subclasses on failure so asyncHandler returns a JSON error
 * before any SSE headers are written.
 */
/** Fetches and decrypts the user's saved API key. Returns undefined if no key saved. */
```
The first block was the doc for `prepareGeneration()` but now floats above `resolveUserApiKey()`'s own JSDoc. It documents nothing — the function it described (`prepareGeneration`) is further down the file.

**Suggested fix:** Move the first JSDoc block to directly above `prepareGeneration()` (line 118).

---

## 14. Route comment says "skips validation" but retains ownership checks

**File:** `packages/server/src/routes/quiz.routes.ts` (line 53)

**Comment:** `// Reconnect flow: skip schema validation, rate limits, and quiz creation.`

**Problem:** The comment previously said "skip validation" broadly. While the current version says "skip schema validation", the `prepareReconnect` service function still performs ownership and authorization validation. The comment is now accurate after the fix in this PR but should be verified.

---

## 15. `useQuizGeneration.test.ts` deleted with no replacement for AC4/AC5

**File:** Previously at `packages/client/src/hooks/useQuizGeneration.test.ts` (deleted)

**Problem:** The old hook had tests for AC4 ("maps 'Analyzing materials...' to 'Generating your quiz...'") and AC5 ("keeps non-target progress messages unchanged"). The hook was replaced by `QuizGenerationProvider`, but no `QuizGenerationProvider.test.tsx` was created. The progress message transformation logic (lines 80-83 of the provider) has no test coverage.

**Suggested fix:** Create `QuizGenerationProvider.test.tsx` covering the progress message transformation.

---

## 16. `isMcqQuestion` helper placed before `logger` constant (file structure order)

**File:** `packages/server/src/services/quiz.service.ts` (lines 38-42)

**Rule:** coding-conventions.md — "Every file follows this order: Imports, Constants, Types/Interfaces, Helper functions, Main exports."

**Problem:** `isMcqQuestion` (a helper function) is placed before `logger` (a module-level constant). Constants should come before helper functions per the file structure rule.

**Suggested fix:** Move `logger` above `isMcqQuestion`.

---

## 17. No regression test for `flushBuffer` on SSE error path

**File:** `packages/client/src/providers/QuizGenerationProvider.tsx` (line 129)

**Problem:** The `onError` handler now correctly calls `flushBuffer` before dispatching `generationFailed`, but this was forgotten and re-added at least twice across commits. There is no test asserting that buffered questions are preserved when an SSE error arrives mid-generation. This class of regression has no automated protection.

**Suggested fix:** Add a test in `QuizGenerationProvider.test.tsx` that verifies buffered questions are flushed to Redux before the error state is set.

---

*Generated from code review of PR #81 on 2026-03-14*
