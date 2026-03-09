# RFC: free-trial-limit
**Date**: 2026-03-08
**Status**: Draft
**Type**: Architectural Change
**TDD Updates Required**: Yes

## 1. Context

**What exists today:** Every quiz generation uses the server's `ANTHROPIC_API_KEY`. Users can generate quizzes with 5-20 questions. Rate limits exist (10/hour, 50/day) but there is no lifetime generation cap. All token costs go to the server owner's Anthropic account.

**Why it needs to change:** Unbounded cost exposure. The product needs a sustainable model where users experience the quality with one free trial, then bring their own Anthropic API key for continued use.

**How we got here:** The MVP was designed for a small user base where the developer covers API costs. As the product matures, a BYOK model is being introduced in two stages: (1) limit free usage, (2) accept user-provided keys.

## 2. Goals and Non-Goals

**Goals:**
1. Limit each user to exactly 1 free quiz generation using the server's API key
2. Lock free-tier generations to exactly 5 questions (user picks difficulty + format only)
3. Track free trial usage per user via `freeTrialUsedAt` timestamp on the User model
4. After trial is consumed, block generation with a clear message about needing their own key

**Non-goals:**
- BYOK implementation (separate feature spec — stage 2)
- Changing the LLM service, prompt architecture, or streaming flow
- Payment integration or subscription logic
- Modifying existing rate limits

## 3. Detailed Design

### What changes

**Database:** Add `freeTrialUsedAt DateTime?` to User model. Nullable — null means trial available.

**Quiz service (`prepareGeneration`):** After session/ownership validation, check `freeTrialUsedAt`. If not null, throw `ForbiddenError`. Return `isFreeTrialGeneration: true` in `PreparedGeneration`.

**Quiz service (`executeGeneration`):** When `isFreeTrialGeneration`, override `questionCount = 5`. After successful generation (status → `in_progress`), set `freeTrialUsedAt = now()`. If generation fails, trial stays unconsumed.

**Auth service (`getMe`):** Return `hasUsedFreeTrial: boolean` derived from `freeTrialUsedAt !== null`.

**Shared schemas:** Add `hasUsedFreeTrial` to `userResponseSchema`. Add `FREE_TRIAL_QUESTION_COUNT = 5` constant.

**Frontend (`QuizPreferences`):** When trial is available, hide count input and show "5 questions" as fixed. When trial is exhausted, parent renders a message instead of the form.

### What stays the same
- LLM service (`anthropic.ts`, `llm.service.ts`) — no changes
- Prompt architecture and SSE streaming — no changes
- Quiz taking, grading, results — no changes
- Rate limiting middleware — still applies to the free generation
- Quiz routes structure — no changes

### Design decisions

**Tracking mechanism:** `freeTrialUsedAt DateTime?` on User model.
- *Chosen:* Explicit timestamp field — clear, no edge cases, simple null check.
- *Rejected:* Counting QuizAttempt records — edge cases with failed generations and existing users.
- *Reasoning:* A dedicated field is explicit about intent and handles existing users gracefully (default null = trial available).

**When to mark trial as used:** After successful generation (status transitions to `in_progress`).
- *Chosen:* Set on success — failed generations don't consume the trial.
- *Rejected:* Set on attempt creation — penalizes users for server/LLM failures.
- *Reasoning:* User should only lose their trial when they actually receive questions.

**Count enforcement:** Backend overrides `questionCount` to 5 regardless of client-sent value.
- *Reasoning:* Security — prevents request manipulation. Frontend hides the input as a UX convenience, but the backend is the source of truth.

## 4. Blast Radius

**Files directly modified:**
- `packages/server/prisma/schema.prisma` — add column
- `packages/server/src/services/quiz.service.ts` — trial check + count override
- `packages/server/src/services/auth.service.ts` — `getMe` response
- `packages/shared/src/schemas/auth.schema.ts` — `userResponseSchema`
- `packages/shared/src/constants/quiz.constants.ts` — new constant
- `packages/client/src/components/quiz/QuizPreferences.tsx` — lock count, trial note
- `packages/client/src/pages/sessions/SessionDashboardPage.tsx` — conditional rendering

**Tests affected:**
- `quiz.service.test.ts` — new tests for trial enforcement
- `auth.service.test.ts` — updated `getMe` response shape

**Features unaffected:** Quiz taking, grading, results, sessions, materials, auth flows.

## 5. Migration / Rollback

**Migration:** Additive nullable column. No data backfill. Deploy backend first, then frontend.

**Rollback:** Revert code. Nullable column can stay (harmless) or be removed in a follow-up migration. No data loss.

## 6. Acceptance Criteria

1. **Given** a new user **When** they view the generation form **Then** count is locked to 5 and a trial note is shown
2. **Given** a new user **When** they generate a quiz **Then** exactly 5 questions are generated and `freeTrialUsedAt` is set
3. **Given** a user whose trial is used **When** they try to generate **Then** they get a 403 with a message about needing their own API key
4. **Given** a user whose trial is used **When** they view the session dashboard **Then** they see a "trial used" message instead of the generation form
5. **Given** a generation that fails mid-stream **When** the user retries **Then** they can still generate (trial not consumed on failure)
6. **Given** an existing user (pre-migration) **When** they visit after deployment **Then** they still have one free trial available

## 7. TDD Updates Required (not implementation scope)

- **TDD Section 4 (Database Schema):** Add `freeTrialUsedAt DateTime?` to User model
- **TDD Section 5 (API Contracts):** Add `hasUsedFreeTrial: boolean` to `GET /api/auth/me` response
- **TDD Section 7 (Error Handling):** Add `TRIAL_EXHAUSTED` error code (403) for quiz generation
