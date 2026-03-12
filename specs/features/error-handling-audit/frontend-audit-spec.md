## Frontend Spec Audit

- **Status**: FAIL
- **Findings** (ordered by severity)

- **ID**: FE-001
- **Severity**: P0
- **Category**: SilentCatch
- **Location**: `packages/client/src/pages/sessions/SessionDashboardPage.tsx`
- **Evidence**:
  ```ts
  } catch {
    return [];
  }
  ```
- **Risk**: Local storage corruption or parse failures are silently swallowed; telemetry loses early signal for state persistence breakage.
- **Required Fix**: Replace with `catch (err)`, call `console.error(...)` and `Sentry.captureException(err, { extra: { operation: 'readViewedFeedbackIds' } })`, then return fallback.
- **Confidence**: High

- **ID**: FE-002
- **Severity**: P0
- **Category**: SilentCatch
- **Location**: `packages/client/src/hooks/useSSEStream.ts`
- **Evidence**:
  ```ts
  } catch {
    // Malformed JSON in SSE event — skip and continue reading.
  }
  ```
- **Risk**: Malformed/partial SSE payloads are silently skipped, hiding protocol regressions and data loss in streaming flows.
- **Required Fix**: Add `catch (err)` with `console.error` + `Sentry.captureException` and include stream metadata (`url`, event chunk, operation).
- **Confidence**: High

- **ID**: FE-003
- **Severity**: P0
- **Category**: SilentCatch
- **Location**: `packages/client/src/api/quizzes.api.ts`
- **Evidence**:
  ```ts
  try {
    await queryFulfilled;
  } catch {
    patchResult.undo();
  }
  ```
- **Risk**: Optimistic update rollback failures are hidden; save failures can occur without any observability trail.
- **Required Fix**: Use `catch (err)`, add `console.error` + `Sentry.captureException(err, { extra: { endpoint: 'saveAnswers', quizId: id } })` before rollback.
- **Confidence**: High

- **ID**: FE-004
- **Severity**: P1
- **Category**: MissingConsoleError
- **Location**: `packages/client/src/hooks/useSSEStream.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    onErrorRef.current('Connection failed. Please check your connection and try again.');
    setStatus('error');
  }
  ```
- **Risk**: Transport/stream failures are surfaced to UI only; incident triage lacks console + Sentry telemetry for connection failures.
- **Required Fix**: Add both `console.error('SSE stream failed', err, context)` and `Sentry.captureException(err, { extra: context })` before UI fallback.
- **Confidence**: High

- **ID**: FE-005
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/pages/sessions/SessionDashboardPage.tsx`
- **Evidence**:
  ```ts
  } catch (err) {
    const userMessage = getUserMessage(...);
    showError(userMessage.title, userMessage.description);
  }
  ```
- **Risk**: Retry/update/delete session failures are user-visible but not observable, creating blind spots for high-value session workflows.
- **Required Fix**: In each catch (`handleRetrySubmission`, `handleUpdate`, `handleDelete`), add both `console.error` and `Sentry.captureException` with `sessionId`/`quizAttemptId`/operation metadata.
- **Confidence**: High

- **ID**: FE-006
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/pages/profile/ProfilePage.tsx`
- **Evidence**:
  ```ts
  } catch (err) {
    const userMessage = getUserMessage(...);
    showError(userMessage.title, userMessage.description);
  }
  ```
- **Risk**: Profile update/password/API key failures are swallowed into toasts, hiding account-critical issues.
- **Required Fix**: Add `console.error` + `Sentry.captureException` in all four catches (username/password/save key/delete key) with operation and user context.
- **Confidence**: High

- **ID**: FE-007
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/pages/sessions/CreateSessionPage.tsx`
- **Evidence**:
  ```ts
  } catch (err) {
    const userMessage = getUserMessage(...);
    showError(userMessage.title, userMessage.description);
  }
  ```
- **Risk**: Session creation failures are not captured, masking onboarding and core workflow regressions.
- **Required Fix**: Add `console.error` and `Sentry.captureException(err, { extra: { operation: 'createSession' } })`.
- **Confidence**: High

- **ID**: FE-008
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/pages/auth/VerifyEmailPage.tsx`
- **Evidence**:
  ```ts
  } catch (err) {
    const { code } = parseApiError(err);
    setState(code === 'CONFLICT' ? 'already-verified' : 'error');
  }
  ```
- **Risk**: Verification flow failures only affect UI state; production email verification problems can go undetected.
- **Required Fix**: Add `console.error` + `Sentry.captureException` with token-presence-safe context (`operation`, route, outcome branch).
- **Confidence**: High

- **ID**: FE-009
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/pages/auth/SignupPage.tsx`, `packages/client/src/pages/auth/ResetPasswordPage.tsx`, `packages/client/src/pages/auth/ForgotPasswordPage.tsx`, `packages/client/src/pages/auth/LoginPage.tsx`
- **Evidence**:
  ```ts
  } catch (err) {
    const userMessage = getUserMessage(...);
    showError(userMessage.title, userMessage.description);
  }
  ```
- **Risk**: Authentication failures in high-traffic flows are reduced to toasts; no standardized telemetry for user-facing auth errors.
- **Required Fix**: Add `console.error` + `Sentry.captureException` in each catch path (including login `onSubmit`) with operation-specific metadata.
- **Confidence**: High

- **ID**: FE-010
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/components/session/MaterialUploader.tsx`
- **Evidence**:
  ```ts
  } catch (err) {
    const userMessage = getUserMessage(...);
    showError(userMessage.title, userMessage.description);
  }
  ```
- **Risk**: Upload/extract URL failures are only surfaced toasts, obscuring reliability issues in material ingestion.
- **Required Fix**: Add `console.error` + `Sentry.captureException` in `uploadFile` and `handleUrlSubmit` catches with `sessionId`, file/url, and operation.
- **Confidence**: High

- **ID**: FE-011
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/client/src/pages/quiz/QuizTakingPage.tsx`
- **Evidence**:
  ```ts
  .catch((err: unknown) => {
    const userMessage = getUserMessage(...);
    showError(userMessage.title, userMessage.description);
  });
  ```
- **Risk**: Autosave and submit-recovery failures can degrade data integrity while staying mostly invisible to telemetry.
- **Required Fix**: In both `.catch(...)` handlers (`doSave` and submit), add `console.error` + `Sentry.captureException` and include `quizId`, `sessionId`, and operation stage.
- **Confidence**: High

- **ID**: FE-012
- **Severity**: P1
- **Category**: MissingConsoleError
- **Location**: `packages/client/src/components/common/ErrorBoundary.tsx`
- **Evidence**:
  ```ts
  Sentry.captureException(error, {
    extra: { componentStack: errorInfo.componentStack },
  });
  ```
- **Risk**: Boundary-caught render/lifecycle failures are sent to Sentry but absent from browser console diagnostics, violating strict policy and reducing local debuggability.
- **Required Fix**: Add `console.error('ErrorBoundary caught error', error, errorInfo)` before `Sentry.captureException`.
- **Confidence**: High

- **ID**: FE-013
- **Severity**: P2
- **Category**: LostContext
- **Location**: `packages/client/src/api/auth.api.ts`
- **Evidence**:
  ```ts
  const isUnauthorized = ...status === 401;
  if (!isUnauthorized) {
    console.error('getMe hydration failed:', err);
    Sentry.captureException(err);
  }
  ```
- **Risk**: 401 branch intentionally suppresses telemetry; repeated auth token invalidation may be under-observed.
- **Required Fix**: Keep spam control but add sampled/rate-limited telemetry for 401 hydration failures, with reason and route context.
- **Confidence**: Medium

- **ID**: FE-014
- **Severity**: P2
- **Category**: UnhandledApiError
- **Location**: `packages/client/src/store/api.ts`
- **Evidence**:
  ```ts
  if (result.error && result.error.status === 401) {
    dispatch(logout());
  }
  ```
- **Risk**: Global 401 handling logs users out silently with no telemetry for auth degradation trends.
- **Required Fix**: Add central `console.error` + `Sentry.captureException` (or structured captured message) with endpoint/method context when 401 auto-logout is triggered.
- **Confidence**: Medium

- **Frontend Coverage Summary**
  - total catches reviewed: **23** (tests/scripts excluded)
  - catches compliant with `console.error + Sentry`: **2**
  - catches non-compliant: **21**
  - unhandled async/API error paths found: **5**
- **Frontend Gate Decision**
  - **FAIL** (P0/P1 findings present)

## Final Audit Verdict

- **Overall**: FAIL
- **Top 5 highest-risk gaps**
  - Multiple silent catch blocks in critical flows (`llm.service`, `health.service`, `useSSEStream`, `quizzes.api`, dashboard local storage parser).
  - Backend catches missing mandatory Sentry in storage/material/LLM/decrypt/auth/validation paths.
  - Frontend user-critical catches (auth/profile/session/quiz/material) rely on toast/UI without required telemetry.
  - Centralized handlers suppress or omit telemetry in common branches (`error.middleware` 4xx handling, client 401 handling).
  - Missing process-level fatal error hooks on server (`unhandledRejection`/`uncaughtException`).
- **Cross-cutting patterns**
  - Catch-and-fallback behavior without mandatory telemetry.
  - Inconsistent contextual metadata (`requestId`, `userId`, operation/entity identifiers) when errors are captured.
  - Mixed policy application: some paths have robust `logger + Sentry`, many adjacent paths have only UI/log-only/no telemetry.
  - Retry/recovery paths can lose root-cause context or generate duplicate captures.
- **Prioritized remediation plan**
  - **Immediate (P0/P1)**
    - Eliminate all bare/empty catches and add mandatory telemetry calls in every catch in scope.
    - Enforce backend catch contract (`logger.error` + `Sentry.captureException`) via shared helper/lint rule.
    - Enforce frontend catch contract (`console.error` + `Sentry.captureException`) via shared helper/lint rule.
    - Patch high-traffic auth/session/quiz/material catches first.
  - **Short-term (P2)**
    - Add dedupe strategy for nested/propagated capture paths (especially email/auth layers).
    - Add sampled telemetry for intentionally high-volume branches (e.g., 401 auto-logout).
    - Preserve causal context in fallback update/rethrow paths.
  - **Hardening (P3)**
    - Add CI static checks for bare catches, missing capture/log calls, and dropped promise rejections.
    - Add runtime metrics dashboards for capture rate by route/operation and alert on sudden drop-offs.

- [ ] No bare/empty catches in scope
- [ ] No swallowed errors in scope
- [ ] Backend catches always log + Sentry
- [ ] Frontend catches always console.error + Sentry
- [ ] No unhandled promise rejections in scope
- [ ] No unhandled API error branches in scope
