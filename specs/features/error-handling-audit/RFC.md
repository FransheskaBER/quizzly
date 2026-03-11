# RFC: Error Handling Audit — Eliminate Silent Failures
**Date**: 2026-03-09
**Status**: Draft
**Type**: Refactor
**TDD Updates Required**: Yes

---

## 1. Context

The codebase has multiple violations of the error handling rule in `coding-conventions.md`: "Never catch an error and swallow it silently. Every catch block must: rethrow, log with context, or return an explicit error response."

**Server violations:**
- `email.service.ts`: Both email functions catch Resend API errors, log + Sentry, but return void — callers never know email failed.
- `quiz.service.ts`: Three fire-and-forget `.catch()` blocks log errors but skip Sentry. Failed Prisma updates leave quizzes in stuck states with no alert.

**Client violations:**
- `MaterialUploader.tsx`: Delete material catch is completely empty.
- `LoginPage.tsx`: Resend verification catch resets state with no logging.
- `auth.api.ts`: `getMe` hydration silently swallows non-401 errors.

**Impact:** Errors that should trigger Slack alerts (via Sentry) are invisible. Users see fake success for failed operations.

## 2. Scope

### Goals
1. Every server catch block sends errors to both pino logger and Sentry.
2. Every client catch block sends errors to both `console.error` and `Sentry.captureException`.
3. Email service throws `EmailDeliveryError` on failure — callers decide how to handle.
4. Zero fire-and-forget patterns — all async operations awaited with try/catch.
5. Zero violations of the coding convention error handling rule after this change.

### Non-Goals
- Not changing the error architecture (AppError hierarchy, `asyncHandler`, `error.middleware.ts`).
- Not adding retry logic for transient errors (separate RFC).
- Not adding a toast/notification system for user-facing feedback (separate RFC).
- Not changing existing user-facing error messages in auth form pages.

## 3. Detailed Design

### 3.1 New Error Class

**File:** `packages/server/src/utils/errors.ts`

Add `EmailDeliveryError`:
- Extends `AppError`
- `statusCode`: 502 (Bad Gateway — upstream service failure, distinguishable from our bugs at 500)
- `code`: `EMAIL_DELIVERY_ERROR`
- Default message: `'Failed to deliver email'`

**Why 502:** The failure is in Resend (upstream), not in our code. Lets Sentry dashboards filter email issues separately from application bugs.

### 3.2 Email Service — Throw Instead of Swallow

**File:** `packages/server/src/services/email.service.ts`

Both `sendVerificationEmail` and `sendPasswordResetEmail`:

**Current pattern (remove):**
```typescript
if (error) {
  logger.error({ err: error, to, from }, 'Failed to send verification email');
  Sentry.captureException(error, { extra: { to, from } });
  return; // ← silent return
}
```

**New pattern:**
```typescript
if (error) {
  logger.error({ err: error, to, from }, 'Failed to send verification email');
  Sentry.captureException(error, { extra: { to, from } });
  throw new EmailDeliveryError('Failed to send verification email');
}
```

Same change in the outer `catch` block — replace silent completion with `throw new EmailDeliveryError(...)`.

**Preserved:** The `EMAIL_FROM` not-configured early return stays. In development without email config, warn and return — this is a config issue, not a runtime error.

### 3.3 Auth Service — Await Email Calls

**File:** `packages/server/src/services/auth.service.ts`

Three callers change from `void sendXxx(...)` to `await sendXxx(...)` with try/catch:

**signup:**
```typescript
// Before: void sendVerificationEmail(user.email, verificationToken);
// After:
try {
  await sendVerificationEmail(user.email, verificationToken);
} catch (err) {
  // Account is already created — don't rollback.
  // Rethrow so client knows email failed. User can resend from login page.
  throw err;
}
```
The `throw err` propagates the `EmailDeliveryError` through `asyncHandler` → `error.middleware.ts` → 502 JSON response to client. Account stays in DB.

**resendVerification:**
```typescript
// Before: void sendVerificationEmail(user.email, verificationToken);
// After:
await sendVerificationEmail(user.email, verificationToken);
```
No try/catch needed — let `EmailDeliveryError` propagate directly. The generic "check your email" response is only returned on success.

**forgotPassword:**
```typescript
// Before: void sendPasswordResetEmail(user.email, token);
// After:
try {
  await sendPasswordResetEmail(user.email, token);
} catch (err) {
  // SECURITY: Must return generic response to prevent email enumeration.
  // Attacker must not distinguish "email doesn't exist" from "email exists but delivery failed".
  logger.error({ err, email: user.email }, 'Password reset email failed');
  Sentry.captureException(err, { extra: { email: user.email } });
  return genericResponse;
}
```

**Why this pattern:** Forgot-password already returns the same response whether the email exists or not. If we let the 502 propagate only when the email exists, an attacker could distinguish real accounts (502) from fake ones (200). Catching and returning the generic response preserves enumeration protection while still alerting developers via Sentry.

### 3.4 Quiz Service — Remove Fire-and-Forget

**File:** `packages/server/src/services/quiz.service.ts`

**Block 1 — `startedAt` timestamp (~line 320):**
```typescript
// Before: fire-and-forget .catch()
// After:
if (attempt.status === QuizStatus.IN_PROGRESS && attempt.startedAt === null) {
  try {
    await prisma.quizAttempt.update({
      where: { id: quizAttemptId },
      data: { startedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, quizAttemptId }, 'Failed to set startedAt');
    Sentry.captureException(err, { extra: { quizAttemptId } });
  }
}
```
Adds a few ms to response. Error is captured but does not block quiz delivery — the catch absorbs it.

**Block 2 — Timeout recovery (~line 547):**
```typescript
// Before: fire-and-forget .catch() inside setTimeout
// After:
const timeoutId = setTimeout(() => {
  timedOut = true;
  writer({ type: 'error', message: 'Grading timed out...' });
  logger.warn({ quizAttemptId }, 'Grading timed out');
  void (async () => {
    try {
      await prisma.quizAttempt.update({
        where: { id: quizAttemptId },
        data: { status: QuizStatus.SUBMITTED_UNGRADED },
      });
    } catch (err) {
      logger.error({ err, quizAttemptId }, 'Failed to set submitted_ungraded after timeout');
      Sentry.captureException(err, { extra: { quizAttemptId } });
    }
  })();
}, SSE_SERVER_TIMEOUT_MS);
```
Inside setTimeout, we can't use top-level await. Async IIFE wraps the operation with proper error handling.

**Block 3 — Error recovery (~line 672):**
```typescript
// Before: fire-and-forget .catch()
// After:
try {
  await prisma.quizAttempt.update({
    where: { id: quizAttemptId },
    data: { status: QuizStatus.SUBMITTED_UNGRADED },
  });
} catch (updateErr) {
  logger.error({ updateErr, quizAttemptId }, 'Failed to set submitted_ungraded after error');
  Sentry.captureException(updateErr, { extra: { quizAttemptId } });
}
```

### 3.5 Client — Add Sentry + Console to Silent Catches

**File:** `packages/client/src/components/session/MaterialUploader.tsx` (~line 160)
```typescript
// Before: catch { /* Silent */ }
// After:
} catch (err) {
  console.error('Failed to delete material:', err);
  Sentry.captureException(err, { extra: { sessionId, materialId } });
}
```

**File:** `packages/client/src/pages/auth/LoginPage.tsx` (~line 49)
```typescript
// Before: catch { setResendStatus('idle') }
// After:
} catch (err) {
  console.error('Failed to resend verification email:', err);
  Sentry.captureException(err, { extra: { email: unverifiedEmail } });
  setResendStatus('idle');
}
```

**File:** `packages/client/src/api/auth.api.ts` (~line 57)
```typescript
// Before: catch { /* 401 handled globally */ }
// After:
} catch (err) {
  // 401 is handled globally by baseQueryWithAuth (dispatches logout()).
  // Capture non-401 errors that indicate real failures.
  const isUnauthorized = (err as { error?: { status?: number } })?.error?.status === 401;
  if (!isUnauthorized) {
    console.error('getMe hydration failed:', err);
    Sentry.captureException(err);
  }
}
```

**Import needed:** All 3 client files need `import { Sentry } from '@/config/sentry';`

## 4. Blast Radius

### Files Directly Modified
| File | Change |
|------|--------|
| `packages/server/src/utils/errors.ts` | Add `EmailDeliveryError` class |
| `packages/server/src/services/email.service.ts` | Throw instead of swallow |
| `packages/server/src/services/auth.service.ts` | Await email calls + handle throws |
| `packages/server/src/services/quiz.service.ts` | Remove 3 fire-and-forget patterns |
| `packages/client/src/components/session/MaterialUploader.tsx` | Add Sentry + console.error |
| `packages/client/src/pages/auth/LoginPage.tsx` | Add Sentry + console.error |
| `packages/client/src/api/auth.api.ts` | Add Sentry + console.error |

### Tests to Update
| Test File | Change |
|-----------|--------|
| `packages/server/src/services/__tests__/email.service.test.ts` | Error cases expect `EmailDeliveryError` throw instead of void return |
| `packages/server/src/services/__tests__/auth.service.test.ts` | Email mocks awaited + new error path tests |
| `packages/server/src/routes/__tests__/auth.routes.test.ts` | New integration tests: signup 502 on email fail, forgot-password enumeration protection |
| `packages/server/src/services/__tests__/quiz.service.test.ts` | Fire-and-forget mocks updated for await pattern |
| `packages/server/src/middleware/__tests__/error.middleware.test.ts` | New test: EmailDeliveryError → 502 response |

### Unchanged (confirmed safe)
- `error.middleware.ts` — `instanceof AppError` check handles `EmailDeliveryError` automatically. No code change, only new test.
- `auth.routes.ts` — `asyncHandler` wraps all handlers. Thrown errors propagate automatically.
- `packages/shared/` — No error types live here.
- `parseApiError()` on client — Already handles any `{ code, message }` shape.

### Features Affected
| Feature | Behavior Change |
|---------|-----------------|
| Signup | Returns 502 if email delivery fails (was: silent success). Account still created. |
| Resend verification | Returns 502 if email delivery fails (was: silent success). |
| Forgot password | No behavior change — still returns generic response. Error goes to Sentry only. |
| Quiz taking | `startedAt` now awaited — adds ~5ms. Failures captured in Sentry. |
| Quiz grading | Timeout/error recovery captured in Sentry. User behavior unchanged. |

## 5. Migration & Rollback

### Migration
- **Strategy:** Single PR. No database changes, no data migration.
- **Sequence:** (1) Add `EmailDeliveryError` → (2) Update `email.service.ts` → (3) Update `auth.service.ts` → (4) Update `quiz.service.ts` → (5) Update client files → (6) Update all tests. Steps 4-5 are independent of 1-3.
- **Backwards compatibility:** Not applicable — no running state, no data format changes.

### Rollback
- **Trigger:** Prolonged Resend outage making signups fail with 502.
- **Steps:** `git revert` the merge commit.
- **Data safety:** Accounts created during outage are valid — they just need verification emails resent after Resend recovers.

## 6. Acceptance Criteria

### Success
1. **Given** a Resend API error during signup, **When** the user submits signup, **Then** server returns 502 with code `EMAIL_DELIVERY_ERROR`, error is in Sentry with `{ to, from }`, and user account exists in DB.
2. **Given** a Resend API error during resend-verification, **When** the user requests resend, **Then** server returns 502 with code `EMAIL_DELIVERY_ERROR` and error is in Sentry.
3. **Given** a Resend API error during forgot-password, **When** the user submits forgot-password, **Then** server returns the generic "if an account exists" response and error is in Sentry (enumeration protection preserved).
4. **Given** a Prisma failure on `startedAt` update, **When** quiz is opened, **Then** error is in Sentry with `{ quizAttemptId }`. Quiz data still returned.
5. **Given** a Prisma failure on status recovery during grading, **When** grading times out or fails, **Then** error is in Sentry with `{ quizAttemptId }`.
6. **Given** a failed material deletion on client, **When** delete API fails, **Then** `console.error` and `Sentry.captureException` are called.
7. **Given** a failed resend-verification on client, **When** resend API fails, **Then** `console.error` and `Sentry.captureException` are called.
8. **Given** a non-401 `getMe` failure, **When** app loads, **Then** `console.error` and `Sentry.captureException` are called.

### Regression
9. **Given** successful email delivery, **When** signup/resend/forgot-password completes, **Then** behavior identical to current.
10. **Given** `EMAIL_FROM` not configured, **When** email function called, **Then** warning logged, function returns without throwing.
11. **Given** 401 on `getMe`, **When** app loads, **Then** `baseQueryWithAuth` dispatches `logout()` unchanged.
12. **Given** successful quiz grading, **When** all Prisma updates succeed, **Then** quiz flow unchanged.

## 7. TDD Updates Required (not implementation scope)

1. **TDD Section 7 (Error Handling)**: Add `EmailDeliveryError` (502, `EMAIL_DELIVERY_ERROR`) to the error class inventory.
2. **TDD Section 3 or 7**: Add project-wide rule: "No fire-and-forget patterns. All async operations must be awaited with try/catch. Best-effort operations use await + try/catch + Sentry capture, not `.catch()` chains."
