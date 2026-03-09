# Feature Spec: byok-api-key
**Date**: 2026-03-08
**Status**: Draft
**PRD User Story**: None (post-MVP; originated from free-trial-limit RFC Section 1 — "stage 2: accept user-provided keys")
**TDD Updates Required**: Yes

## 1. Context

**What exists today:** Each user gets one free quiz generation using the server's Anthropic API key. After the trial is consumed, the session dashboard shows a "coming soon" message and blocks further generation.

**What this feature does:** After the free trial, users can provide their own Anthropic API key to continue generating quizzes and grading free-text answers. The key is ephemeral — sent per-request via a custom header, used for one LLM call, then garbage collected. It is never persisted in the database, never logged, and never returned in API responses.

**Why it matters:** Removes the cost barrier for the server owner while letting users continue using the product with their own Anthropic account. Completes the two-stage model outlined in the free-trial-limit RFC.

**Dependencies:** free-trial-limit RFC (implemented — `freeTrialUsedAt` field, `hasUsedFreeTrial` in getMe response, `FREE_TRIAL_QUESTION_COUNT` constant).

## 2. Scope

**In scope:**
- Accept API key via `X-Anthropic-Key` request header for generation, grading, and regrade endpoints
- Validate key format on client and server (`sk-ant-` prefix, minimum 20 characters)
- Create per-request `Anthropic` client in LLM service instead of using the global singleton
- Frontend `ApiKeyInput` component replaces "coming soon" message on session dashboard
- `QuizPreferences` unlocks question count input (5–20) when using BYOK
- Store key in module-level variable only (invisible to DevTools, cleared on page refresh)
- Security hardening: custom Helmet CSP, pino-http header redaction, Anthropic error sanitization

**Out of scope:**
- Persisting keys in the database
- Validating keys against Anthropic API before use (too slow; let the LLM call fail naturally)
- Key management UI (settings page, multiple keys, key rotation)
- Usage tracking or billing per user key
- Changing rate limits for BYOK users (same 10/hr, 50/day as free trial)
- BYOK for any provider other than Anthropic

## 3. Design Decisions

### Decision 1: Header name — `X-Anthropic-Key`
- **Chosen:** Custom `X-Anthropic-Key` header, read in route handlers
- **Rejected:** Reusing `Authorization` header (already carries the JWT token); embedding key in query params (logged in server access logs, browser history, referrer headers)
- **Reasoning:** Separate header avoids conflicting with auth middleware. Route handlers read it explicitly — no middleware changes needed.

### Decision 2: Key validation — Format-only, no API call
- **Chosen:** Check `sk-ant-` prefix + minimum 20 characters on both client and server. If the key is wrong, the actual LLM call will fail and surface an SSE error event.
- **Rejected:** Pre-validating against Anthropic API (adds 1–2s latency to pre-stream phase; creates a side-channel for key probing)
- **Reasoning:** Format validation catches typos and empty values. Real validation happens at LLM call time — the error is surfaced as a clear "Invalid API key" SSE event.

### Decision 3: Per-request Anthropic client via factory function
- **Chosen:** New `resolveAnthropicClient(apiKey?: string)` in LLM service. If `apiKey` provided → `new Anthropic({ apiKey })`. If omitted → return global singleton from `config/anthropic.ts`.
- **Rejected:** Middleware that swaps the global client per-request (concurrency hazard in Node.js — requests share the same event loop); passing the key to the Anthropic SDK on each `.messages.stream()` call (SDK doesn't support per-call key override)
- **Reasoning:** Per-request client is the cleanest isolation. The client object and key are garbage collected after the request handler returns.

### Decision 4: Key propagation path
- Route handler reads `X-Anthropic-Key` from `req.headers`
- Passes to `prepareGeneration` / `prepareGrading` → returned in `PreparedGeneration` / `GradingContext` as `anthropicApiKey?: string`
- `executeGeneration` / `executeGrading` passes to LLM service functions (`generateQuiz`, `gradeAnswers`)
- LLM service creates per-request client via `resolveAnthropicClient(apiKey)`

### Decision 5: Free trial logic change
- If trial NOT used → free trial generation using server key (ignore any user-provided key)
- If trial used AND `X-Anthropic-Key` header present with valid format → BYOK generation, `isFreeTrialGeneration = false`
- If trial used AND no header → throw `TrialExhaustedError` (code `TRIAL_EXHAUSTED`)
- If trial used AND header present but malformed format → throw `BadRequestError` pre-stream

### Decision 6: Frontend key storage — Module-level variable (not Redux)
- **Chosen:** `apiKeyStore.ts` with `getApiKey()` / `setApiKey()` / `subscribeApiKey()`. A `useApiKey()` hook wraps `useSyncExternalStore` for reactive UI state.
- **Rejected:** Redux slice (key visible in Redux DevTools extension even in production); localStorage (persists across sessions, violates ephemeral requirement); React context (visible in React DevTools)
- **Reasoning:** Module-level variable is invisible to all browser DevTools. Cleared on page refresh (module reloads). `useSyncExternalStore` provides reactivity without exposing the key string in any inspectable state.

### Decision 7: Grading with BYOK
- Free-text grading requires an LLM call → needs the user's key if trial is used
- MCQ-only quizzes grade via string comparison (no LLM) → no key needed even post-trial
- The grading route reads `X-Anthropic-Key` and threads it through `GradingContext` to `executeGrading` → `llmGradeAnswers`
- Regrade follows the same pattern

## 4. Security Hardening

### 4a. XSS / Key exfiltration — Custom Helmet CSP
- **Current gap:** `app.use(helmet())` uses defaults only. No `connect-src` restriction — injected JS could `fetch()` the key to any external domain.
- **Fix:** Add custom CSP config to Helmet:
  - `connect-src 'self'` — frontend never calls Anthropic directly; only our backend does
  - `script-src 'self'` — block injected inline scripts
- **File:** `packages/server/src/app.ts`

### 4b. Key logged in plaintext — Redact from pino-http
- **Current gap:** `pino-http` uses default serializers which log ALL request headers. `X-Anthropic-Key` would appear in every log entry.
- **Fix:** Add custom `serializers.req` to pino-http config that clones `req.headers` and deletes `x-anthropic-key` before logging.
- **File:** `packages/server/src/app.ts`

### 4c. Anthropic SDK error leaking key — Sanitize LLM errors
- **Current gap:** Anthropic SDK errors could contain the key or key-related details in error messages.
- **Fix:** In `callLlmStream`, catch Anthropic client errors. If it's an authentication error (status 401), throw `BadRequestError('Invalid API key. Please check your key and try again.')`. Never forward raw SDK error text to the client.
- **File:** `packages/server/src/services/llm.service.ts`

### 4d. DevTools exposure — Module-level variable
- **Fix:** Use module-level variable instead of Redux (see Decision 6). Key string never appears in Redux DevTools, React DevTools, or any browser-inspectable state.
- **File:** `packages/client/src/store/apiKeyStore.ts`

### 4e. Browser Network tab — UX mitigation
- The key is visible in request headers in the Network tab. This is unavoidable — it's the user's own browser.
- Use `type="password"` on the input field so the key is masked on screen.
- **File:** `packages/client/src/components/quiz/ApiKeyInput.tsx`

### 4f. Compromised server — Minimize attack surface
- Key exists only as local variables scoped to the request handler → service → LLM call chain.
- Never stored in any data structure that outlives the request (no cache, no Map, no global variable).
- After the Anthropic API call returns, the per-request client and key are garbage collected.

## 5. Data Model Changes

The API key is never persisted. However, a flag is needed to distinguish free-trial quizzes from BYOK quizzes for grading enforcement.

| Table | Column | Type | Default | Purpose |
|---|---|---|---|---|
| `quiz_attempts` | `is_free_trial` | `BOOLEAN NOT NULL` | `false` | Distinguishes free-trial quizzes (graded with server key) from BYOK quizzes (require user key for free-text grading) |

## 6. API Contract Changes

### Generation: `GET /api/sessions/:sessionId/quizzes/generate`

**New optional request header:**
```
X-Anthropic-Key: sk-ant-api03-...
```

**Behavior changes:**
| Trial status | Header present | Header format | Result |
|---|---|---|---|
| Not used | Any | Any | Free trial generation (server key), `isFreeTrialGeneration = true`, count locked to 5 |
| Used | Yes | Valid | BYOK generation, `isFreeTrialGeneration = false`, count from query (5–20) |
| Used | Yes | Malformed | 400 `BAD_REQUEST` — "Invalid API key format" |
| Used | No | — | 403 `TRIAL_EXHAUSTED` — "Free trial generation used. Provide your own Anthropic API key to generate more quizzes." |

**SSE error for invalid key (during stream):**
```json
{ "type": "error", "message": "Invalid API key. Please check your key and try again." }
```

### Grading: `POST /api/quizzes/:id/submit`

**New optional request header:** same as generation.

**Behavior changes:**
- If quiz has free-text questions → LLM call needed → key required (if trial used)
- If quiz is MCQ-only → no LLM call → key not needed even post-trial
- **BYOK grading enforcement:** If `quiz_attempt.is_free_trial = false` AND quiz has free-text questions AND no `X-Anthropic-Key` header → 403 `TRIAL_EXHAUSTED`. Same rule applies to regrade.
- Error codes: same 400/403 as generation

### Regrade: `POST /api/quizzes/:id/regrade`

Same header behavior as submit.

## 7. Blast Radius

**Files directly modified:**

| File | Change |
|---|---|
| `packages/shared/src/constants/quiz.constants.ts` | Add `ANTHROPIC_KEY_PREFIX`, `MIN_ANTHROPIC_KEY_LENGTH` |
| `packages/shared/src/schemas/quiz.schema.ts` | Add `anthropicKeySchema` |
| `packages/server/src/app.ts` | Helmet CSP config + pino-http serializer |
| `packages/server/src/services/llm.service.ts` | `resolveAnthropicClient()`, optional `apiKey` param, error sanitization |
| `packages/server/src/services/quiz.service.ts` | Thread `anthropicApiKey` through interfaces + functions |
| `packages/server/src/routes/quiz.routes.ts` | Read + validate `X-Anthropic-Key` header |
| `packages/client/src/store/apiKeyStore.ts` | New: module-level key store + `useApiKey` hook |
| `packages/client/src/components/quiz/ApiKeyInput.tsx` | New: password input + format validation |
| `packages/client/src/pages/sessions/SessionDashboardPage.tsx` | Replace "coming soon" with `ApiKeyInput` + conditional `QuizPreferences` |
| `packages/client/src/hooks/useQuizGeneration.ts` | Read key from store, pass as header |
| `packages/client/src/hooks/useSSEStream.ts` | Accept optional extra headers in fetch |
| `packages/client/src/components/quiz/QuizPreferences.tsx` | Accept `isByok` prop, show count input (5–20) |

**Tests affected:**
- `llm.service.test.ts` — new tests for `resolveAnthropicClient`, error sanitization
- `quiz.service.test.ts` — new tests for BYOK generation/grading paths
- `quiz.routes` integration tests (if they exist) — header validation

**Features unaffected:** Quiz taking, results, sessions, materials, auth flows, MCQ grading (no LLM).

## 8. Acceptance Criteria

1. **Given** a user whose trial is used **When** they enter a valid API key and generate a quiz **Then** the quiz is generated using their key and question count is user-selected (5–20)
2. **Given** a user whose trial is used **When** they try to generate without providing a key **Then** they get a 403 with message about needing their own API key
3. **Given** a user whose trial is used with a valid key **When** they submit a quiz with free-text questions **Then** grading uses their key via a per-request Anthropic client
4. **Given** a BYOK generation **When** the user's Anthropic key is rejected by the API **Then** an SSE error event says "Invalid API key. Please check your key and try again."
5. **Given** a BYOK generation request **When** the `X-Anthropic-Key` header has an invalid format (no `sk-ant-` prefix or too short) **Then** a 400 is returned pre-stream with "Invalid API key format"
6. **Given** a user who entered their API key **When** they refresh the page **Then** the key is cleared and must be re-entered
7. **Given** a free trial user (trial not used) **When** they generate a quiz **Then** the server key is used regardless of any provided `X-Anthropic-Key` header
8. **Given** a BYOK user generating a quiz **When** they select question count **Then** the count input allows 5–20 (not locked to 5)
9. **Given** a user whose trial is used **When** they submit an MCQ-only quiz **Then** grading succeeds without an API key (no LLM call needed)
10. **Given** any request with an `X-Anthropic-Key` header **When** pino-http logs the request **Then** the key is redacted from the logged headers

## 9. Testing Requirements

| Acceptance Criterion | Layer | What to test | Mocks |
|---|---|---|---|
| AC1 | Unit (quiz.service) | BYOK generation path: `isFreeTrialGeneration = false`, user-selected count | Prisma, LLM service |
| AC2 | Unit (quiz.service) | `prepareGeneration` throws `TrialExhaustedError` when trial used + no key | Prisma |
| AC3 | Unit (quiz.service) | `executeGrading` passes `apiKey` to `llmGradeAnswers` | Prisma, LLM service |
| AC4 | Unit (llm.service) | `callLlmStream` catches Anthropic 401, throws sanitized error | Anthropic SDK |
| AC5 | Unit (route handler) | Route returns 400 for malformed key format | — |
| AC6 | Unit (apiKeyStore) | `setApiKey` → `getApiKey` returns key; module reload clears it | — |
| AC7 | Unit (quiz.service) | `prepareGeneration` ignores header when trial not used | Prisma |
| AC8 | Unit (QuizPreferences) | Renders count input (5–20) when `isByok = true` | — |
| AC9 | Unit (quiz.service) | MCQ-only grading skips LLM, succeeds without key | Prisma |
| AC10 | Unit (app.ts) | pino-http serializer strips `x-anthropic-key` from logged headers | — |

## 10. TDD Updates Required (not implementation scope)

- **TDD Section 5 (API Contracts):** Add `X-Anthropic-Key` optional header to generation, submit, and regrade endpoints
- **TDD Section 6 (Authentication & Security):** Add CSP policy (`connect-src 'self'`, `script-src 'self'`) and pino-http header redaction rule
- **TDD Section 7 (Error Handling):** Add `INVALID_KEY_FORMAT` error (400) for malformed `X-Anthropic-Key` header
