# Review: byok-api-key-storage
**Date**: 2026-03-12
**Spec file**: RFC.md
**Overall result**: Deviations found and resolved — **remediation complete (2026-03-12)**

---

## Remediation Summary

All deviations have been resolved and all test gaps closed:

- **Deviation 1 (Spec was ambiguous):** RFC blast-radius clarified to state `isByok = hasUsedFreeTrial && hasApiKey`.
- **Deviation 2 (Code is wrong):** `invalidatesTags: ['Dashboard']` added to `updateProfile` mutation in `user.api.ts`.
- **Deviation 3 (Spec is outdated):** `INVALID_KEY_FORMAT` removed from TDD §5.1; dead `InvalidKeyFormatError` class removed from `errors.ts`.

Test gaps addressed:
- **AC1:** `quiz.routes.test.ts` — BYOK integrated flow (save key → generate quiz, assert LLM gets decrypted key).
- **AC3:** `ProfilePage.test.tsx` — masked hint, Remove button, no full-key rendering.
- **AC4:** `SessionDashboardPage.test.tsx` — BYOK prompt + profile link when `hasUsedFreeTrial && !hasApiKey`.
- **AC7:** `user.api.test.ts` — `updateProfile` invalidates Dashboard cache (tag-based assertion).
- **AC8:** `user.routes.test.ts` — login with new password succeeds, old password fails.
- **GET /auth/me `hasApiKey`:** `auth.routes.test.ts` — explicit false/true assertions.

---

## Deviations

### 1. `isByok` derived from both `hasUsedFreeTrial && hasApiKey`, not `hasApiKey` alone
- **Section**: §3.6 Frontend Changes / §4 Blast Radius (`QuizPreferences.tsx`)
- **Type**: Spec was ambiguous
- **Spec says**: "Derive `isByok` from `hasApiKey`" (blast-radius table for `QuizPreferences.tsx`)
- **Code does**: `isByok={meData?.hasUsedFreeTrial === true && meData?.hasApiKey === true}` in `packages/client/src/pages/sessions/SessionDashboardPage.tsx` line 273
- **Root cause**: The RFC phrased the derivation as "from `hasApiKey`" but didn't account for a user who has saved a key but has not yet consumed their free trial. If such a user sees the BYOK preferences UI (with a question-count input), the server will still run it as a free-trial generation and override the count to `FREE_TRIAL_QUESTION_COUNT`. The implementation correctly conditions on `hasUsedFreeTrial` too, keeping the UI consistent with server behaviour. The spec failed to say "after the free trial is consumed".
- **Resolution**: Update RFC §3.6 to read "Derive `isByok` from `hasUsedFreeTrial && hasApiKey`" to match the correct behaviour.

---

### 2. Dashboard username not invalidated on profile update (AC7)
- **Section**: §6 Acceptance Criteria, criterion 7
- **Type**: Code is wrong
- **Spec says**: "Given a user updates username on profile Then change persists and reflects across the app"
- **Code does**: `packages/client/src/api/user.api.ts` — the `updateProfile` mutation has no `invalidatesTags` call. `ProfilePage.tsx` manually forces a `getMe` refetch (so the auth slice and the profile page itself update), but `getDashboard` provides `[{ type: 'Dashboard' }]` and is never invalidated. The username shown in `HomeDashboardPage` (fetched via `getDashboard`) stays stale until the user navigates away and back.
- **Root cause**: The blast-radius table in the RFC listed `HomeDashboardPage.tsx` as "Add profile link to top bar" and did not explicitly note that `updateProfile` must invalidate the dashboard cache. The agent focused on the listed change (adding the link) and missed the cache-tag side-effect.
- **Resolution**: Add `invalidatesTags: ['Dashboard']` to the `updateProfile` mutation in `packages/client/src/api/user.api.ts`.

---

### 3. `INVALID_KEY_FORMAT` error code defined but never emitted
- **Section**: §3.3 API Endpoints (POST /api/users/api-key error column) + TDD §5.1 error codes
- **Type**: Spec is outdated
- **Spec says**: TDD §5.1 lists `400: VALIDATION_ERROR, BAD_REQUEST, INVALID_KEY_FORMAT`. The RFC implies an `INVALID_KEY_FORMAT` error (column says "400 invalid format") for a bad API key.
- **Code does**: `validate({ body: saveApiKeySchema })` middleware fires on invalid keys. When Zod parsing fails, `error.middleware.ts` converts it to `400 VALIDATION_ERROR` — the same code used for all Zod failures. `InvalidKeyFormatError` exists in `errors.ts` but nothing throws it.
- **Root cause**: `INVALID_KEY_FORMAT` was added to the TDD error codes table when the BYOK spec was drafted, anticipating a dedicated error class. However, the validate middleware design means all Zod failures (including bad API key prefix) surface as `VALIDATION_ERROR`. The response is still 400 with a clear message; only the error code differs from the TDD table entry.
- **Resolution**: Removed `InvalidKeyFormatError` from `packages/server/src/utils/errors.ts` and removed `INVALID_KEY_FORMAT` from the 400 error code list in `specs/TDD.md` §5.1.

---

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|------------|--------|--------|
| AC1: Save key → refresh → generate works without re-entering | Yes | Partial (save+status+BYOK generation path tested separately; no combined integration test) | Gap |
| AC2: DB column contains ciphertext not plaintext | Yes | Yes — `user.routes.test.ts`: "stores encrypted ciphertext, not plaintext" | Pass |
| AC3: Profile page shows `sk-ant-...xxxx` hint and delete button, never full key | Yes | No — no `ProfilePage` component test | Gap |
| AC4: Delete key → generate quiz → prompted to save in profile | Yes (server + frontend) | Partial — server `TrialExhaustedError` tested; frontend prompt not tested | Gap |
| AC5: POST `/api/users/api-key` invalid format → 400 | Yes | Yes — `user.routes.test.ts`: "returns 400 for invalid API key format" | Pass |
| AC6: DELETE when no key exists → 204 (idempotent) | Yes | Yes — `user.routes.test.ts`: "returns 204 even when no key exists (idempotent)" | Pass |
| AC7: Update username → persists and reflects across app | Partial — DB + profile page + auth slice, but Dashboard cache stale | Yes for endpoint; no cross-component stale-cache test | Fail |
| AC8: Correct current password + change → new password works for login | Yes | Partial — change returns 200; no subsequent login-with-new-password assertion | Gap |
| AC9: Wrong current password → 401 | Yes | Yes — `user.routes.test.ts`: "returns 401 for wrong current password" | Pass |
| AC10: Free-trial user → generate → server key used | Yes | Yes — `quiz.service.test.ts`: "uses server key when trial is not used" | Pass |
| AC11: BYOK user + free-text quiz → grading uses decrypted DB key | Yes | Yes — `quiz.service.test.ts`: "passes userApiKey to LLM grading service for BYOK" | Pass |
| AC12: BYOK MCQ-only quiz → grading succeeds without key | Yes | Yes — `quiz.service.test.ts`: "allows grading BYOK MCQ-only quiz without key" | Pass |
| AC13: `X-Anthropic-Key` header → pino-http redacts it | Yes | Yes — `app.test.ts` | Pass |
| AC14: Rollback → ephemeral flow restored | N/A (rollback scenario) | N/A | N/A |

**Additional gap (not in original criteria):** `GET /api/auth/me` response added `hasApiKey` field (RFC §3.5), but `auth.routes.test.ts` has no assertion verifying this field is present in the response.

---

## Lessons Learned

- **Cache invalidation must be specified explicitly in blast-radius tables.** When an RFC lists a mutation endpoint, the blast-radius entry must include which RTK Query cache tags it invalidates — not just the functional change (e.g. "add profile link"). Add a `Cache tags invalidated` column to blast-radius tables, or explicitly call out `invalidatesTags` in the mutation description.

- **Acceptance criteria for cross-component state must name the specific component.** "Reflects across the app" is too vague. Write: "Then the username shown in `HomeDashboardPage` updates without requiring a page reload." This makes the required RTK Query invalidation self-evident.

- **Frontend component tests should be listed as a deliverable in every RFC that creates a new page.** `ProfilePage.tsx` was created but has no component test. Add a "Tests required" section to RFC blast-radius tables alongside each new page file.

- **RFC blast-radius entries for component prop changes should document the expected prop value formula.** "Derive `isByok` from `hasApiKey`" is ambiguous when a second state variable (`hasUsedFreeTrial`) is needed to determine the correct behaviour. Express it as a Boolean formula: `isByok = hasUsedFreeTrial && hasApiKey`.

- **Integration tests should be written as end-to-end flows for acceptance criteria that span multiple service calls.** AC1 spans `POST /api/users/api-key` → `GET /api/sessions/:sid/quizzes/generate`. Tests that cover only individual endpoints leave the connection between them untested. For RFC acceptance criteria involving multi-step flows, write a single integration test that performs all steps.

---

## TDD Updates Required

- **§5.1 (API error codes):** ✓ Done — removed `INVALID_KEY_FORMAT` from the `400` error code list. Dead `InvalidKeyFormatError` class also removed from `errors.ts`.
