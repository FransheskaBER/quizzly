# RFC: Streaming Quiz Generation — Per-Question Parsing, Early Quiz Start, and Malformed Question Recovery

**Date**: 2026-03-14
**Status**: Draft
**Type**: Refactor + Enhancement
**TDD Updates Required**: Yes

---

## 1. Context

Quiz generation currently waits for the LLM to produce all questions, validates the entire batch, then saves them to the database and streams them to the frontend via SSE. Despite using SSE, the user waits 15-45 seconds (depending on question count and model speed) before seeing any questions — because `callLlmStream` calls `stream.finalText()`, which buffers the entire LLM response before returning.

The SSE infrastructure on both frontend and backend already supports incremental `question` events. The `quizStream` Redux slice already accumulates questions as they arrive. The bottleneck is entirely in the backend: `runWithRetry` returns a fully-parsed, fully-validated array — and `executeGeneration` saves and streams questions only after that call resolves.

Additionally, the user must wait on the generation progress screen until all questions are generated before navigating to the quiz-taking page. There is no mechanism to start answering while generation is still in progress.

**Current flow:**
```
LLM call starts → wait 15-45s → all questions returned → validate batch →
→ save all to DB → stream all via SSE → user sees questions → user clicks "Start Quiz"
```

**Proposed flow:**
```
LLM call starts → parse question 1 (~5s) → validate → save to DB → SSE →
→ user sees question 1 → user starts quiz → parse question 2 → validate → save → SSE →
→ user answering question 1 while questions 2-N arrive
```

## 2. Scope

### Goals

1. **First question visible within ~5-10 seconds** — instead of waiting 15-45s for all questions. Measurable: time from SSE connection open to first `question` event.
2. **User can start taking the quiz before all questions are generated** — navigate to the quiz-taking page and answer question 1 while questions 2-N are still being generated and saved.
3. **Malformed questions are recovered gracefully** — skip malformed questions, renumber valid ones sequentially, attempt one replacement per malformed question (appended to the end), and if replacement also fails, show a reassuring note in the final slot explaining what happened.
4. **Malformed question failures captured in Sentry** — structured error with raw LLM output, Zod validation errors, question metadata, and key type. Actionable for prompt tuning.
5. **Page refresh resilience** — if the user refreshes mid-generation, fetch existing questions from the API and reconnect to the SSE stream for remaining questions.

### Non-Goals

- **Changing the grading flow** — grading already works (MCQ is instant, free-text is one batched LLM call). Different problem, different RFC.
- **Changing the prompt architecture** — the two-phase `<analysis>` + `<questions>` prompt structure stays. We're changing how we *consume* the LLM output, not how we *request* it.
- **Real-time token-by-token streaming to the frontend** — the unit of streaming is a complete validated question, not raw tokens.
- **Changing the SSE transport layer** — `useSSEStream.ts`, SSE event types/schemas, the fetch-based SSE client all stay unchanged.
- **Adding redux-persist** — DB + SSE reconnection handles the page refresh case without adding library complexity.

## 3. Detailed Design

### 3.1 Per-Question LLM Output Parsing

**File:** `packages/server/src/services/llm.service.ts`

#### Problem

`callLlmStream` calls `stream.finalText()` which buffers the entire LLM response before returning. `runWithRetry` then validates the whole batch at once. Even though the Anthropic SDK returns a stream object, we wait for it to finish.

#### Change

Replace the all-at-once flow with incremental XML parsing that yields individual questions as they're completed by the LLM.

**New function: `streamQuestions()`**

Replaces the current `generateQuiz()` → `runWithRetry()` → `callLlmStream()` → `stream.finalText()` chain for quiz generation specifically. Grading continues using `runWithRetry` unchanged.

```typescript
export async function streamQuestions(
  params: GenerateQuizParams,
  onValidQuestion: (question: LlmGeneratedQuestion, assignedNumber: number) => Promise<void>,
  onMalformedQuestion: (rawOutput: string, zodErrors: ZodError, slotNumber: number) => void,
  apiKey?: string,
): Promise<StreamQuestionsResult>
```

**Return type:**
```typescript
interface StreamQuestionsResult {
  validCount: number;
  malformedSlots: MalformedSlot[];
}

interface MalformedSlot {
  originalSlotNumber: number;
  rawLlmOutput: string;
  zodErrors: ZodError;
}
```

**Parsing approach:**

The LLM outputs questions inside a `<questions>[...JSON array...]</questions>` block. Each question is a JSON object in the array. The stream produces tokens incrementally.

Strategy: accumulate the stream text. When inside the `<questions>` block, use a brace-depth counter to detect complete JSON objects. Each time a top-level `}` closes (depth returns to 0 within the array), extract that object, parse it as JSON, validate against `llmGeneratedQuestionSchema` (the single-question schema, not the array schema).

- If valid: call `onValidQuestion` with the next sequential `assignedNumber` (1, 2, 3...).
- If malformed: call `onMalformedQuestion`, do NOT assign a number — this slot will be retried at the end.
- Continue parsing remaining questions in the stream.

**Exfiltration check:** Run `checkExfiltration()` on each accumulated chunk as it grows, same as current behavior.

**Important:** `onValidQuestion` is `async` because the caller (`executeGeneration`) saves to DB and sends SSE inside it. The stream pauses while each question is processed — this is intentional. The LLM SDK buffers tokens in memory, so no data is lost. The pause is ~50ms (one DB write + SSE send), negligible compared to LLM token generation speed.

#### What stays unchanged

- `runWithRetry` — still used for grading (`gradeAnswers`). Not touched.
- `callLlmStream` — still used by `runWithRetry`. Not touched.
- `parseBlock`, `extractBlock` — still used by `runWithRetry`. Not touched.
- `resolveAnthropicClient` — shared by both flows. Not touched.
- All prompts — system prompt, user prompt, difficulty prompts. Not touched.
- `CORRECTIVE_MESSAGE` — used only by `runWithRetry` for grading retries. Not touched.

### 3.2 Malformed Question Recovery

**File:** `packages/server/src/services/quiz.service.ts` (within `executeGeneration`)

#### Replacement flow

After the main LLM stream completes, if there are malformed slots:

1. For each malformed slot (max iterations = malformed count):
   - Make a single LLM call requesting 1 question, with context about what's already been generated (question numbers, topics covered via tags) to avoid duplicates.
   - Validate the single question against `llmGeneratedQuestionSchema`.
   - If valid: save to DB with the next sequential `questionNumber`, send SSE `question` event.
   - If invalid: this slot has exhausted its 1-retry budget. Mark as permanently failed.

2. **Failure threshold:** If permanently failed questions exceed 20% of the requested count (1 for 5 questions, 2 for 10, 4 for 20), the generation quality is too unreliable. However, since valid questions have already been streamed and possibly answered by the user, we do NOT abort. We serve the reduced set and update `questionCount` to the actual count.

3. **Reassuring note for failed slots:** For each permanently failed question, send a new SSE event type `question_failed`:
   ```typescript
   writer({
     type: 'question_failed',
     data: {
       questionNumber: assignedNumber, // last slot(s)
       message: "We tried twice to generate this question, but the AI output wasn't valid. "
         + "To avoid using more of your API tokens, we stopped here. "
         + "Your quiz score will be calculated based on the questions you answered — no penalty for this one.",
     },
   });
   ```

4. **Replacement prompt:** A minimal prompt requesting 1 question:
   - Same system prompt as the original generation.
   - User message includes: subject, goal, difficulty, answer format, materials text, plus a list of already-generated question topics (extracted from tags) with instruction "generate a question covering a DIFFERENT concept."
   - Same temperature (`LLM_GENERATION_TEMPERATURE`).
   - Uses the same Anthropic client (same API key) as the original generation.

#### Renumbering on the fly

Valid questions get `questionNumber` assigned in the order they're successfully validated, not in the order the LLM outputs them. If the LLM outputs questions 1-5 and question 3 is malformed:

- LLM question 1 → saved as `questionNumber: 1`
- LLM question 2 → saved as `questionNumber: 2`
- LLM question 3 → malformed, skipped
- LLM question 4 → saved as `questionNumber: 3`
- LLM question 5 → saved as `questionNumber: 4`
- Replacement for malformed → saved as `questionNumber: 5`

The user never sees a gap. By the time they reach question 5, the replacement has had 2+ minutes to generate (they spend 30-90 seconds per question).

### 3.3 Sentry Error Capture for Malformed Questions

**File:** `packages/server/src/services/quiz.service.ts`

#### Error: `QuizQuestionGenerationFailed`

Captured via `Sentry.captureException` (not a thrown error — generation continues). Three severity levels:

| Scenario | Sentry Level | When |
|---|---|---|
| Question malformed, replacement succeeded | `warning` | Self-healed; track frequency for prompt tuning |
| Question malformed, replacement also failed (user got reassuring note) | `error` | User got degraded experience — actionable |
| 2+ questions permanently failed (threshold hit) | `error` with `high_priority` tag | Pattern problem — likely a prompt issue |

**Structured context (`extra`):**

| Field | Purpose |
|---|---|
| `quizAttemptId` | Find the specific quiz |
| `questionSlot` | Which LLM output position failed (e.g., 3 of 5) — reveals patterns |
| `attemptNumber` | `1` (first try) or `2` (replacement) — tracks if retries work |
| `rawLlmOutput` | The actual malformed text — most important field for debugging prompts |
| `zodValidationErrors` | Zod's specific error messages (e.g., "expected string at options[2], got null") |
| `questionType` | MCQ vs free_text — reveals if one type fails more |
| `difficulty` | easy/medium/hard — reveals if harder questions break more |
| `materialType` | Whether materials were provided — reveals if material context causes issues |
| `modelUsed` | Which Claude model — constant now but future-proofs |
| `isServerKey` | Boolean — critical to know if it's your key or user's BYOK |
| `totalQuestionsRequested` | Requested count for context |
| `successfulQuestions` | How many succeeded — shows severity |

**Sentry tags (for filtering/alerting):**

- `quiz.generation.failure_type`: `malformed_question` | `replacement_failed` | `threshold_exceeded`
- `quiz.generation.question_type`: `mcq` | `free_text`
- `quiz.generation.key_type`: `server` | `byok`

**No truncation** of `rawLlmOutput` — a single question's output is typically 200-1000 characters, well within Sentry's event size limits. Full output is essential for prompt debugging.

### 3.4 Updated `executeGeneration` Flow

**File:** `packages/server/src/services/quiz.service.ts`

Replace the current flow (call `llmGenerateQuiz` → iterate saved questions) with:

```
1. Create quiz attempt (status: GENERATING)           — unchanged
2. Send progress event "Generating your quiz..."       — unchanged
3. Call streamQuestions() with callbacks:
   - onValidQuestion: save to DB + send SSE question event (same as current per-question loop)
   - onMalformedQuestion: log + accumulate for later retry
4. If malformed slots exist:
   - For each: call replacement LLM (1 question), validate, save + SSE if valid
   - If replacement fails: capture Sentry error, send question_failed SSE event
5. Commit generation (update status → IN_PROGRESS, set questionCount to actual)  — unchanged
6. Send complete SSE event                              — unchanged
```

**Free trial validation change:** Currently validates that the LLM returned exactly `FREE_TRIAL_QUESTION_COUNT` MCQ questions. With per-question streaming, this check moves to after all questions (including replacements) are processed. The check becomes: `validCount === FREE_TRIAL_QUESTION_COUNT && all questions are MCQ`. If a free trial generation has any permanently failed questions, the entire attempt fails (free trial must produce exactly 5 questions — no partial results for unpaid users).

### 3.5 Frontend: Early Quiz Start via Redux Bridge

#### Lifting `useQuizGeneration` above page navigation

**Current:** `useQuizGeneration` lives in the `SessionDashboardPage` component. When the user navigates to `QuizTakingPage`, the hook unmounts, the SSE connection closes, and the Redux slice resets.

**Change:** Create a `QuizGenerationProvider` (React context) that wraps the route tree containing both `SessionDashboardPage` and `QuizTakingPage`. This provider owns the `useQuizGeneration` hook. Child components access generation state via a `useQuizGenerationContext()` hook instead of calling `useQuizGeneration` directly.

**File:** `packages/client/src/providers/QuizGenerationProvider.tsx` (new)

```typescript
interface QuizGenerationContextValue {
  generate: (sessionId: string, preferences: GenerateQuizQuery) => void;
  status: GenerationStatus;
  questions: Question[];
  quizAttemptId: string | null;
  error: string | null;
  totalExpected: number;
  warning: string | null;
  progressMessage: string | null;
  reset: () => void;
  isGenerating: boolean; // convenience: status === 'connecting' || status === 'generating'
}
```

The provider:
- Holds the SSE connection and Redux dispatch logic (moved from `useQuizGeneration`).
- Survives navigation between session dashboard and quiz-taking page.
- Resets when the user navigates to a different session (provider re-mounts because the route param changes).

**Where to mount:** In the route configuration, wrap the session-scoped routes:

```tsx
<Route path="/sessions/:sessionId" element={<QuizGenerationProvider />}>
  <Route index element={<SessionDashboardPage />} />
  <Route path="quiz/:id" element={<QuizTakingPage />} />
</Route>
```

`QuizGenerationProvider` renders an `<Outlet />` and provides context to all children.

#### Changes to `SessionDashboardPage`

- Replace direct `useQuizGeneration(sessionId)` call with `useQuizGenerationContext()`.
- When generation status becomes `'generating'` and at least 1 question is in Redux, show a "Start Quiz" button alongside the progress view.
- "Start Quiz" navigates to `/sessions/${sessionId}/quiz/${quizAttemptId}`.
- The progress view continues showing incoming questions in the background (the SSE connection stays alive because the provider didn't unmount).

#### Changes to `QuizTakingPage`

**Current:** Fetches all questions via `useGetQuizQuery(id)` and assumes they're all present.

**Change:** Dual data source — RTK Query for persisted questions + Redux `quizStream` for generation status:

1. On mount: call `useGetQuizQuery(id)` to fetch whatever questions exist in DB.
2. Read `quizStream.status` from context:
   - If `'complete'` — all questions are in DB. Normal flow, no changes.
   - If `'generating'` — generation still in progress. Merge DB questions with any new ones arriving via Redux.
3. **"Next" button behavior:**
   - If the next question exists (in DB or Redux): enabled, navigate normally.
   - If the next question doesn't exist yet and generation is still in progress: disabled, show a spinner with tiered messaging (see §3.6).
   - If generation is complete and this is the last question: show "Finish Quiz" (or "Submit").

4. **Handling `question_failed` events:** When a `question_failed` event arrives for the last slot, display the reassuring note card instead of a question card. This card:
   - Uses an info/warning visual style (not an error style — not the user's fault).
   - Shows the message from the SSE event.
   - The "Next" button becomes "Finish Quiz" or advances to submit, since this is always the last slot.

### 3.6 Tiered UX for Disabled "Next" Button

When the user reaches a question that hasn't arrived yet (rare — see timing analysis below):

| Wait Duration | UI State |
|---|---|
| 0-5 seconds | "Next" button shows a spinner icon + text "Preparing next question..." |
| 5-15 seconds | Same spinner + text changes to "Still working on it — this can take a few seconds..." |
| 15+ seconds | Text changes to "This is taking longer than expected." Below it, a secondary action: "Save progress and come back later" link. |

**Timing analysis — why users will rarely see this:**

- Each question takes ~3-8 seconds to generate (LLM response for 1 structured question).
- Users spend ~30-90 seconds answering a coding question (reading code, thinking, selecting answer).
- By the time the user finishes question 1 (~30-90s), questions 2-5 are already generated (~15-40s total).
- The only scenarios where "Next" would be disabled:
  - Speed-clicking through without answering (not realistic).
  - LLM is exceptionally slow (API overload).
  - A malformed question triggered a replacement call, adding ~5-8 seconds.

**"Save and come back later" flow:**
- Questions already answered are saved to DB (autosave is already implemented).
- User navigates away.
- Generation may complete in the background (backend continues even if SSE disconnects — existing timeout behavior).
- On return: `getQuiz` returns all saved questions + answers. If status is `IN_PROGRESS`, quiz is ready. If still `GENERATING`, reconnect to SSE (see §3.7).

### 3.7 Page Refresh Resilience

**Problem:** Redux state is in-memory and lost on page refresh. If the user refreshes while generation is in progress, the Redux store reinitializes empty and the SSE connection drops.

**Solution:** On mount, the `QuizGenerationProvider` checks if there's an active generation for this session:

1. Fetch session data (already done via `useGetSessionQuery`). Check if any quiz attempt has `status: GENERATING`.
2. If yes: fetch existing questions via `getQuiz` (returns whatever's saved to DB so far), then reconnect to the SSE stream to receive remaining questions.
3. If no: normal idle state. User can start a new generation.

**Backend support:** The generation SSE endpoint currently creates a new quiz attempt on every call. We need a mechanism to reconnect to an in-progress generation's SSE stream without creating a duplicate attempt.

**Approach:** Add a query parameter `?reconnect=true&quizAttemptId={id}` to the existing generation endpoint. When `reconnect=true`:
- Skip `prepareGeneration()` (validation already passed on initial call).
- Skip quiz attempt creation (already exists).
- Resume sending SSE events for questions that are saved to DB after the reconnection point.
- The backend tracks the current generation in-memory (it's still running in the same server process). If the process restarted (deploy, crash), the generation is gone — return the quiz in its current state with whatever questions were saved.

**Important limitation:** Reconnection only works if the backend process is the same one running the generation. Render's single-instance web service means this is always true for a single user's generation. If the server restarts mid-generation, the quiz attempt stays in `GENERATING` status with partial questions. The reconnect endpoint detects this (no in-memory generation found) and returns a `complete` event with the partial results, updating status to `IN_PROGRESS`.

### 3.8 New SSE Event Type: `question_failed`

**File:** `packages/shared/src/schemas/quiz.schema.ts`

Add a new SSE event schema:

```typescript
export const sseQuestionFailedEventSchema = z.object({
  type: z.literal('question_failed'),
  data: z.object({
    questionNumber: z.number(),
    message: z.string(),
  }),
});
```

**File:** `packages/shared/src/types/index.ts`

```typescript
export type SseQuestionFailedEvent = z.infer<typeof sseQuestionFailedEventSchema>;
```

**Frontend handling:** `useQuizGeneration` receives `question_failed` events and dispatches a new Redux action `questionFailed` that stores the failed slot info. `QuizTakingPage` checks for failed slots when rendering the question at a given index and shows the reassuring note card instead of a `QuestionCard`.

## 4. Blast Radius

### Files Directly Modified

| File | Change |
|------|--------|
| `packages/server/src/services/llm.service.ts` | Add `streamQuestions()` function. `generateQuiz()` updated to call it. `runWithRetry`, `callLlmStream`, `parseBlock` unchanged. |
| `packages/server/src/services/quiz.service.ts` | `executeGeneration()` rewritten to use `streamQuestions()`, per-question save+SSE, malformed recovery, Sentry capture, `question_failed` events. |
| `packages/server/src/routes/quiz.routes.ts` | Add `reconnect` query param handling for SSE reconnection. |
| `packages/server/src/utils/sse.utils.ts` | No changes — `sendSSEEvent` and `SseWriter` already support any event shape. |
| `packages/shared/src/schemas/quiz.schema.ts` | Add `sseQuestionFailedEventSchema`. Add single-question validation schema (`llmGeneratedQuestionSchema` — may already exist as part of the array schema). |
| `packages/shared/src/types/index.ts` | Add `SseQuestionFailedEvent` type export. |
| `packages/client/src/providers/QuizGenerationProvider.tsx` | **New file.** React context wrapping session routes. |
| `packages/client/src/hooks/useQuizGeneration.ts` | Move SSE + Redux logic into provider. This file becomes a thin wrapper or is removed. |
| `packages/client/src/store/slices/quizStream.slice.ts` | Add `questionFailed` action and `failedSlots` state. |
| `packages/client/src/pages/session/SessionDashboardPage.tsx` | Replace `useQuizGeneration` with `useQuizGenerationContext()`. Add "Start Quiz" button when first question arrives. |
| `packages/client/src/pages/quiz/QuizTakingPage.tsx` | Dual data source (RTK Query + Redux). Disabled "Next" with tiered UX. Reassuring note card for failed slots. |
| `packages/client/src/components/quiz/QuestionFailedCard.tsx` | **New file.** Info card shown for permanently failed question slots. |
| Route configuration file (e.g., `App.tsx` or router config) | Wrap session routes with `QuizGenerationProvider`. |

### Files Unchanged (Confirmed Safe)

| File | Why unchanged |
|------|--------------|
| `useSSEStream.ts` | Generic SSE transport — already handles any event type. No changes. |
| `quizzes.api.ts` (RTK Query) | `getQuiz`, `saveAnswers`, `submitQuiz` — all unchanged. Quiz taking and grading work on DB data. |
| All prompt files (`system.prompt.ts`, `user.prompt.ts`, difficulty prompts) | Prompt architecture unchanged. |
| `error.middleware.ts` | Not involved — SSE errors are sent as events, not HTTP error responses. |
| `prisma/schema.prisma` | No schema changes. `questionCount` already supports partial results. |
| Grading flow (`gradeAnswers`, grading routes, grading SSE) | Completely separate flow. Not touched. |

### Features Affected

| Feature | Behavior Change |
|---------|-----------------|
| Quiz generation (all users) | Questions appear incrementally (~5s for first) instead of all at once (~15-45s). |
| Quiz taking | Can start before all questions generated. "Next" button disabled if next question not ready (rare). |
| Free trial generation | Same incremental flow, but fails entirely if final count ≠ 5 (no partial results for free trial). |
| Session dashboard | New "Start Quiz" button appears during generation when first question arrives. |
| Page refresh during generation | Questions preserved in DB, SSE reconnection for remaining questions. |

## 5. Migration & Rollback

### Migration

- **Strategy:** Single PR. No database changes, no data migration.
- **Sequence:**
  1. Add `sseQuestionFailedEventSchema` to shared package.
  2. Add `streamQuestions()` to `llm.service.ts`.
  3. Update `executeGeneration()` in `quiz.service.ts` (backend streaming + malformed recovery + Sentry).
  4. Add reconnect support to `quiz.routes.ts`.
  5. Add `QuizGenerationProvider` and `QuestionFailedCard` (new frontend files).
  6. Update `quizStream.slice.ts` with `questionFailed` action.
  7. Update `SessionDashboardPage` and `QuizTakingPage`.
  8. Update route configuration.
  9. Tests for all changes.
- **Steps 2-4 are backend-only and can be tested independently.** Steps 5-8 are frontend-only and depend on step 1 (shared schema).
- **Backwards compatibility:** The SSE event format is additive (new `question_failed` event type). Existing `question`, `progress`, `complete`, `error` events unchanged. Old frontend would ignore `question_failed` — but since this is a single PR, both sides deploy together.

### Rollback

- **Trigger:** Streaming parser produces more malformed questions than the batch approach (regression in generation quality).
- **Steps:** `git revert` the merge commit. The batch approach is fully restored.
- **Data safety:** Any quizzes generated during the streaming period are valid — they're saved to DB with the same schema. No data migration needed.

## 6. Acceptance Criteria

### Per-Question Streaming (Backend)

1. **Given** a quiz generation request for 5 questions, **When** the LLM produces the first complete question, **Then** it is validated, saved to DB, and sent as an SSE `question` event within ~5-10 seconds of stream start — without waiting for questions 2-5.
2. **Given** a quiz generation request, **When** the LLM stream produces questions incrementally, **Then** each valid question is saved to DB and sent via SSE independently, with `questionNumber` assigned sequentially (1, 2, 3...) in validation order.
3. **Given** a quiz generation where question 3 of 5 is malformed, **When** question 3 fails Zod validation, **Then** questions 4 and 5 are saved as `questionNumber: 3` and `questionNumber: 4` respectively (renumbered, no gap).

### Malformed Question Recovery

4. **Given** a malformed question during generation, **When** the main stream completes, **Then** a single replacement LLM call is made requesting 1 question with context about already-generated topics.
5. **Given** a malformed question whose replacement succeeds, **When** the replacement is validated, **Then** it is saved to DB with the next sequential `questionNumber` (last slot) and sent as an SSE `question` event.
6. **Given** a malformed question whose replacement also fails, **When** both attempts are exhausted, **Then** a `question_failed` SSE event is sent with the reassuring message, and `questionCount` is updated to the actual number of valid questions.
7. **Given** a free trial generation where any question permanently fails, **When** the final valid count is less than `FREE_TRIAL_QUESTION_COUNT`, **Then** the entire generation fails (free trial requires exactly 5 questions).

### Sentry Error Capture

8. **Given** a malformed question that was successfully replaced, **When** the replacement succeeds, **Then** a Sentry `warning` is captured with: `quizAttemptId`, `questionSlot`, `attemptNumber: 1`, `rawLlmOutput`, `zodValidationErrors`, `questionType`, `difficulty`, `materialType`, `modelUsed`, `isServerKey`, `totalQuestionsRequested`, `successfulQuestions`, and tags `quiz.generation.failure_type: malformed_question`, `quiz.generation.key_type`.
9. **Given** a malformed question whose replacement also failed, **When** the user receives the reassuring note, **Then** a Sentry `error` is captured with `attemptNumber: 2` and tag `quiz.generation.failure_type: replacement_failed`.
10. **Given** 2+ permanently failed questions in a single generation, **Then** Sentry `error` is captured with tag `quiz.generation.failure_type: threshold_exceeded` and a `high_priority` tag.

### Early Quiz Start (Frontend)

11. **Given** generation is in progress and at least 1 question has been received, **When** the user is on the session dashboard, **Then** a "Start Quiz" button is visible alongside the generation progress view.
12. **Given** the user clicks "Start Quiz" during generation, **When** they navigate to the quiz-taking page, **Then** the SSE connection stays alive (provider didn't unmount) and new questions continue arriving via Redux.
13. **Given** the user is on the quiz-taking page and clicks "Next", **When** the next question exists (in DB or Redux), **Then** the next question is displayed immediately.
14. **Given** the user clicks "Next" but the next question hasn't arrived yet, **When** generation is still in progress, **Then** the "Next" button is disabled with a spinner and the text "Preparing next question...".
15. **Given** the "Next" button has been disabled for 5-15 seconds, **Then** the text changes to "Still working on it — this can take a few seconds...".
16. **Given** the "Next" button has been disabled for 15+ seconds, **Then** the text changes to "This is taking longer than expected." with a "Save progress and come back later" link below.
17. **Given** the user clicks "Save progress and come back later", **When** they navigate away, **Then** all answered questions are saved to DB (autosave already handles this) and the user can return later to a fully generated quiz.

### Reassuring Note for Failed Questions

18. **Given** a `question_failed` event is received for the last slot, **When** the user navigates to that slot, **Then** they see an info card (not error-styled) with the reassuring message explaining that generation was attempted twice, stopped to protect their API tokens, and their score is based on answered questions only.
19. **Given** a quiz with 4 valid questions and 1 failed slot (of 5 requested), **When** the quiz is graded, **Then** the score is calculated as `(totalScore / 4) * 100` — based on actual valid questions, no penalty.

### Page Refresh Resilience

20. **Given** the user refreshes the page during generation, **When** the page reloads, **Then** existing questions are fetched from the API via `getQuiz` and displayed.
21. **Given** the user refreshes and generation is still in progress on the server, **When** the page detects a `GENERATING` status quiz attempt, **Then** it reconnects to the SSE stream and receives remaining questions as they're generated.
22. **Given** the user refreshes but the server process restarted (deploy/crash), **When** the reconnect endpoint finds no in-memory generation, **Then** it returns the quiz in its current state with whatever questions were saved, updating status to `IN_PROGRESS`.

### Regression

23. **Given** all questions generate successfully (no malformed output), **When** generation completes, **Then** behavior is identical to current: all questions in DB, status `IN_PROGRESS`, `complete` SSE event with `quizAttemptId`.
24. **Given** a user who does NOT start the quiz early (waits for completion), **When** they click "Start Quiz" after the `complete` event, **Then** behavior is identical to current.
25. **Given** quiz grading, **When** the user submits answers, **Then** grading flow is completely unchanged — `gradeAnswers` still uses `runWithRetry` with batch validation.

## 7. TDD Updates Required (not implementation scope)

1. **TDD Section on LLM Integration:** Document the new `streamQuestions()` function alongside existing `generateQuiz()`. Note that quiz generation uses incremental parsing while grading uses batch `runWithRetry`.
2. **TDD Section on SSE Events:** Add `question_failed` event type to the SSE event inventory.
3. **TDD Section on Error Handling:** Document `QuizQuestionGenerationFailed` Sentry capture pattern — not a thrown error, but a structured Sentry event with specific tags and context fields.
4. **TDD Section on Frontend Architecture:** Document `QuizGenerationProvider` pattern — React context wrapping session routes, surviving page navigation, providing generation state to both dashboard and quiz-taking pages.
5. **TDD Section on Quiz Generation:** Update the generation flow diagram to show per-question streaming, malformed recovery, and the early-start user flow.
