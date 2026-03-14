# RFC: Specific SSE Error Messages for Anthropic API Key Failures

**Date**: 2026-03-14
**Status**: Draft
**Type**: Bug Fix
**TDD Updates Required**: Yes

---

## 1. Context

Two code paths in `llm.service.ts` call the Anthropic API:

- **`callLlmStream()`** (line 101): Used for grading and replacement questions. Catches `Anthropic.AuthenticationError`, converts to `BadRequestError` with sanitized message. Works correctly.
- **`streamQuestions()`** (line 223): Used for main quiz generation SSE stream. No Anthropic error handling. Errors propagate to `executeGeneration()` in `quiz.service.ts`, which catches all errors and sends a hardcoded generic SSE message: `"Generation failed. Please try again."`.

BYOK users with invalid keys, revoked keys, or exhausted credits see the generic message and cannot diagnose the issue.

## 2. Goals and Non-Goals

### Goals

1. Invalid API key (401) or permission denied (403) during `streamQuestions()` → specific SSE error message.
2. Rate limit / insufficient credits (429) during `streamQuestions()` → specific SSE error message.
3. Consistent error handling across both LLM code paths.
4. Raw Anthropic SDK error messages never reach the client (TDD §7.7.1).

### Non-Goals

- Pre-flight API key validation before generation.
- Handling every Anthropic error type individually (500, network errors stay generic).
- Frontend changes (already renders backend-provided messages).
- Changes to the grading path (`callLlmStream()` already correct).

## 3. Detailed Design

### Change 1: `streamQuestions()` in `llm.service.ts`

Wrap the `for await (const event of stream)` loop (lines 266-352) in a try/catch. Catch three Anthropic error types:

| SDK Error | Status | User-Facing Message |
|---|---|---|
| `Anthropic.AuthenticationError` | 401 | `"Could not generate your quiz. Your API key appears to be invalid. Please verify you added the correct key."` |
| `Anthropic.PermissionDeniedError` | 403 | Same as 401 message |
| `Anthropic.RateLimitError` | 429 | `"Could not generate your quiz. Your Anthropic account may have insufficient credits or has hit a rate limit. Please check your account balance."` |

For each: log with full context, capture in Sentry, re-throw as `BadRequestError` with the sanitized message. Mark the new error as captured to avoid duplicate Sentry reports.

This mirrors the existing pattern in `callLlmStream()` (lines 117-133).

**Decision**: Catch in `streamQuestions()` (Option A) rather than `executeGeneration()` (Option B). Reason: keeps Anthropic SDK concerns inside the LLM service layer; quiz service never imports Anthropic types.

### Change 2: `executeGeneration()` in `quiz.service.ts`

In the catch block (line 618-619), replace:

```typescript
writer({ type: 'error', message: 'Generation failed. Please try again.' });
```

With:

```typescript
const userMessage = err instanceof AppError
  ? err.message
  : 'Generation failed. Please try again.';
writer({ type: 'error', message: userMessage });
```

Import `AppError` from `../utils/errors.js`. This forwards sanitized `BadRequestError` messages from the LLM service while preserving the generic fallback for unexpected errors (plain `Error`, network failures, etc.).

### What stays the same

- `callLlmStream()` — no changes.
- Frontend (`useSSEStream`, `QuizGenerationProvider`, `QuizProgress`) — already renders whatever message the SSE event contains.
- Error middleware — not involved (SSE errors bypass it).
- Free trial failure (line 586) — throws plain `Error`, so generic fallback still applies.

## 4. Blast Radius

### Files directly modified

| File | Change |
|---|---|
| `packages/server/src/services/llm.service.ts` | Add try/catch in `streamQuestions()` for 3 Anthropic error types |
| `packages/server/src/services/quiz.service.ts` | Update `executeGeneration()` catch block to forward `AppError` messages |

### Tests affected

| File | Impact |
|---|---|
| `packages/server/src/services/__tests__/streamQuestions.test.ts` | New tests: 3 error types caught and re-thrown as `BadRequestError` |
| `packages/server/src/services/__tests__/executeGeneration.streaming.test.ts` | Line 274 unchanged — free trial throws plain `Error`, generic fallback still applies. New test needed: `AppError` message forwarded via SSE. |

### No changes needed

- `llm.service.test.ts` — existing `callLlmStream` auth tests stay as-is
- `quiz.service.test.ts`, `quiz.routes.test.ts` — mock `streamQuestions`, unaffected
- All frontend files — no changes

## 5. Migration / Rollback

**Migration**: Single commit. Both files deploy together. No data changes, no feature flags.

**Rollback**: `git revert`. No data to un-migrate.

## 6. Acceptance Criteria

### Success

- AC1: **Given** BYOK user with invalid API key, **When** quiz generation starts, **Then** SSE error message is `"Could not generate your quiz. Your API key appears to be invalid. Please verify you added the correct key."`
- AC2: **Given** BYOK user whose key triggers `PermissionDeniedError`, **When** quiz generation starts, **Then** SSE error message is same as AC1.
- AC3: **Given** BYOK user with exhausted credits / rate limited (429), **When** quiz generation starts, **Then** SSE error message is `"Could not generate your quiz. Your Anthropic account may have insufficient credits or has hit a rate limit. Please check your account balance."`
- AC4: **Given** any Anthropic auth/permission/rate-limit error, **When** caught in `streamQuestions()`, **Then** logged with full context and captured in Sentry before re-throw. Raw SDK message never reaches client.
- AC5: **Given** non-Anthropic error during generation, **When** `executeGeneration()` catches it, **Then** SSE error is generic `"Generation failed. Please try again."`

### Regression

- AC6: Free trial failure (plain `Error`) still sends generic message.
- AC7: `callLlmStream()` auth error handling unchanged.
- AC8: Successful quiz generation happy path unchanged.

### Rollback

- AC9: Revert commit → all errors return to generic message, no residual effects.

## 7. TDD Updates Required (not implementation scope)

- **TDD Section 7.5 (Quiz Generation failure table)**: Add rows for BYOK-specific Anthropic errors (401/403 → key invalid message, 429 → credits/rate limit message), distinct from generic "Anthropic API down." Reason: Design decision to differentiate Anthropic SDK error types in `streamQuestions()`.
