# RFC: Toast Notification System — User-Friendly Error & Success Feedback
**Date**: 2026-03-11
**Status**: Draft
**Type**: Feature + Refactor
**TDD Updates Required**: Yes

---

## 1. Context

After the error-handling-audit RFC, every error is now properly caught, logged, and sent to Sentry. But the **user experience** of those errors is still poor:

- Most API errors show a raw backend message (e.g., "Failed to send verification email") inside an inline `FormError` component.
- Non-form actions (deleting a material, autosaving, background operations) have no visible feedback when they fail.
- Success actions (session created, quiz submitted) rely on page navigation as implicit confirmation — no explicit "it worked" signal.
- Error messages are technical, not actionable. Users don't know whether to retry, wait, or contact support.

**Goal:** Add a toast notification system with user-friendly messages that follow a structured format:

- **User-fixable errors:** What happened + why + how to fix it.
- **Non-user-fixable errors:** What happened + why + expected wait time.
- **Success confirmations:** Short confirmation of completed action.

---

## 2. Scope

### Goals
1. Custom `Toast` component (no external dependency) with success, error, and warning variants.
2. Redux slice for toast state management with `addToast` and `dismissToast` actions.
3. `useToast()` hook for convenient imperative usage from any component.
4. Client-side error message map that translates backend error codes + action context into user-friendly messages.
5. Toasts for all async API operations (mutations) — both error and success paths.
6. Existing inline `FormError` stays for synchronous form validation (Zod/React Hook Form field errors).

### Non-Goals
- Not changing backend error response format. Backend keeps `{ error: { code, message, details } }`.
- Not adding retry buttons inside toasts (separate feature).
- Not adding a persistent notification center / history.
- Not changing the ErrorBoundary system (those handle React render crashes, not API errors).
- Not adding i18n / localization for messages.

---

## 3. Detailed Design

### 3.0 Constants — Nothing Hardcoded

**Absolute rule:** No magic numbers or raw values in component code, slice logic, or CSS. Every configurable value lives in one of two places:

**File:** `packages/client/src/components/common/toast.constants.ts`

```typescript
/** Max toasts visible at once. Oldest evicted when exceeded. */
export const MAX_VISIBLE_TOASTS = 3;

/** Auto-dismiss durations in milliseconds, keyed by variant. */
export const TOAST_DURATIONS: Record<ToastVariant, number> = {
  success: 3_000,
  warning: 5_000,
  error: 6_000,
};

/** z-index for the toast container. Must sit above Modal (1000). */
export const TOAST_Z_INDEX = 1100;

/** Offset from viewport edges in pixels. */
export const TOAST_VIEWPORT_OFFSET = 16;

/** Gap between stacked toasts in pixels. */
export const TOAST_GAP = 12;

/** HTTP status codes treated as transient (short wait message). */
export const TRANSIENT_STATUS_CODES: ReadonlySet<number> = new Set([502, 503]);
```

**CSS tokens** (added to `packages/client/src/styles/global.css` under `:root`):

```css
/* Toast tokens */
--toast-z-index: 1100;
--toast-viewport-offset: 16px;
--toast-gap: 12px;
--toast-max-width: 420px;
--toast-min-width: 320px;
```

Components and CSS reference these constants/tokens — never raw `3000`, `16px`, `1100`, or `3` in code.

### 3.1 Toast Component

**Files:**
- `packages/client/src/components/common/Toast.tsx`
- `packages/client/src/components/common/Toast.module.css`
- `packages/client/src/components/common/ToastContainer.tsx`
- `packages/client/src/components/common/ToastContainer.module.css`

**Toast variants:**

| Variant | Icon | Left border color | Auto-dismiss | Use case |
|---------|------|-------------------|-------------|----------|
| `success` | Checkmark | `--color-success` | 3s | Action completed |
| `error` | X circle | `--color-error` | 6s | API failure, operation failed |
| `warning` | Alert triangle | `--color-warning` | 5s | Degraded state, partial failure |

**Toast anatomy:**
```
┌─────────────────────────────────────────────┐
│ ● [Icon]  Title (bold)                   [X]│
│           Description (regular weight)      │
│           ━━━━━━━━━━━░░░░ (auto-dismiss bar)│
└─────────────────────────────────────────────┘
```

**Behavior:**
- Rendered via `createPortal()` into `document.body` (proven pattern from `Modal.tsx`).
- Position: top-right, `var(--toast-viewport-offset)` from viewport edges.
- Max `MAX_VISIBLE_TOASTS` visible. When capacity exceeded, the oldest is dismissed.
- Auto-dismiss after `TOAST_DURATIONS[variant]` ms. Timer pauses on hover.
- Close button (X) for manual dismissal.
- Slide-in from right on enter, fade-out on exit.
- CSS transitions using `--transition-base`.
- Container z-index: `var(--toast-z-index)` (above Modal at 1000).

**Props interface:**
```typescript
interface ToastProps {
  id: string;
  variant: 'success' | 'error' | 'warning';
  title: string;
  description?: string;
  onDismiss: (id: string) => void;
}
```

**ToastContainer** reads from Redux and renders the stack:
```typescript
const ToastContainer: React.FC = () => {
  const toasts = useAppSelector(selectToasts);
  const dispatch = useAppDispatch();

  return createPortal(
    <div className={styles.container}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onDismiss={(id) => dispatch(dismissToast(id))}
        />
      ))}
    </div>,
    document.body,
  );
};
```

**Placement:** `<ToastContainer />` rendered once in `App.tsx`, outside `<Routes>`.

### 3.2 Toast Redux Slice

**File:** `packages/client/src/store/slices/toast.slice.ts`

```typescript
interface ToastItem {
  id: string;
  variant: 'success' | 'error' | 'warning';
  title: string;
  description?: string;
}

interface ToastState {
  toasts: ToastItem[];
}
```

**Actions:**
- `addToast(payload: Omit<ToastItem, 'id'>)` — generates UUID, appends to array, enforces `MAX_VISIBLE_TOASTS` (evicts oldest).
- `dismissToast(id: string)` — removes by ID.

**Selector:**
- `selectToasts(state: RootState): ToastItem[]` — returns the toast array.

**Store integration:** Add `toast: toastReducer` to `store.ts` reducer map.

### 3.3 `useToast` Hook

**File:** `packages/client/src/hooks/useToast.ts`

Thin wrapper around dispatch for ergonomic usage:

```typescript
interface UseToastReturn {
  showSuccess: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning: (title: string, description?: string) => void;
}

const useToast = (): UseToastReturn => {
  const dispatch = useAppDispatch();

  return {
    showSuccess: (title, description) =>
      dispatch(addToast({ variant: 'success', title, description })),
    showError: (title, description) =>
      dispatch(addToast({ variant: 'error', title, description })),
    showWarning: (title, description) =>
      dispatch(addToast({ variant: 'warning', title, description })),
  };
};
```

### 3.4 User-Friendly Error Message Map

**File:** `packages/client/src/utils/error-messages.ts`

This is the core of the user-facing experience. A single file maps `(errorCode, actionContext)` to a user-friendly `{ title, description }` pair.

**Action contexts** (string literals):
```typescript
type ActionContext =
  | 'signup'
  | 'login'
  | 'resend-verification'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email'
  | 'create-session'
  | 'update-session'
  | 'delete-session'
  | 'upload-material'
  | 'delete-material'
  | 'generate-quiz'
  | 'submit-quiz'
  | 'save-answer'
  | 'regrade-quiz'
  | 'save-api-key'
  | 'delete-api-key';
```

**Tone rules:**
- Titles always start with a verb ("Couldn't", "Ran into", "Hit", "Lost").
- Conversational English — like a helpful friend, not a corporate error page.
- No jargon. Never say "server", "502", "validation", "conflict", "unauthorized", or "rate limit" to users.
- Use contractions ("couldn't", "didn't", "you've").
- Short sentences. No filler words.

**Message structure:**

**User-fixable errors (4xx):**
> **Title:** Verb + what happened
> **Description:** Why it happened. How to fix it.

**Non-user-fixable errors (5xx):**
> **Title:** Verb + what happened
> **Description:** Why it happened. Expected wait time.

Wait time logic based on HTTP status code:
- `502` (Bad Gateway) or `503` (Service Unavailable) → "Give it a few minutes and try again."
- Other `5xx` → "We're working on it — check back in a few hours."

**Message map (complete):**

```typescript
// Error code → action context → { title, description }
// Falls back to: error code default → generic default

const ERROR_MESSAGES: Record<string, Record<string, UserMessage> & { _default: UserMessage }> = {

  VALIDATION_ERROR: {
    _default: {
      title: "Couldn't save that",
      description: 'Some of the fields need fixing. Check the ones highlighted in red and try again.',
    },
  },

  BAD_REQUEST: {
    'verify-email': {
      title: "Couldn't verify your email",
      description: "This link has expired or was already used. Head to the login page and request a new one.",
    },
    'reset-password': {
      title: "Couldn't reset your password",
      description: "This link has expired or was already used. Head to the login page and request a new one.",
    },
    _default: {
      title: "Couldn't process that",
      description: "Something about the request didn't look right. Double-check your input and try again.",
    },
  },

  INVALID_KEY_FORMAT: {
    _default: {
      title: "Didn't recognize that API key",
      description: 'Anthropic keys start with "sk-ant-". Make sure you copied the whole thing and try again.',
    },
  },

  EMAIL_NOT_VERIFIED: {
    _default: {
      title: "Haven't verified your email yet",
      description: "Check your inbox for the verification link we sent you. Didn't get it? Hit 'Resend' below.",
    },
  },

  TRIAL_EXHAUSTED: {
    _default: {
      title: "Ran out of free quizzes",
      description: "You've used all your free tries. Add your own Anthropic API key in Settings to keep going.",
    },
  },

  NOT_FOUND: {
    _default: {
      title: "Couldn't find that",
      description: "It might've been deleted or the link is wrong. Head back and try again.",
    },
  },

  CONFLICT: {
    signup: {
      title: "Couldn't create your account",
      description: 'That email is already taken. Try logging in instead, or use a different email.',
    },
    _default: {
      title: "Ran into a conflict",
      description: "Someone else may have changed this. Refresh the page and try again.",
    },
  },

  RATE_LIMITED: {
    _default: {
      title: "Slow down a bit",
      description: "You've been doing that too fast. Wait about a minute and try again.",
    },
  },

  EMAIL_DELIVERY_ERROR: {
    signup: {
      title: "Created your account, but couldn't send the email",
      description: "You're all set up — we just couldn't send the verification email right now. Head to the login page and hit 'Resend' in a few minutes.",
    },
    'resend-verification': {
      title: "Couldn't send the verification email",
      description: "Our email system is having a moment. Give it a few minutes and try again.",
    },
    'forgot-password': {
      title: "Couldn't send the reset email",
      description: "Our email system is having a moment. Give it a few minutes and try again.",
    },
    _default: {
      title: "Couldn't send that email",
      description: "Our email system is having a moment. Give it a few minutes and try again.",
    },
  },

  UNAUTHORIZED: {
    _default: {
      title: "Lost your session",
      description: "You got signed out. Log back in and you'll be good to go.",
    },
  },

  FORBIDDEN: {
    _default: {
      title: "Can't do that",
      description: "You don't have permission for this one. If that seems wrong, try logging out and back in.",
    },
  },
};
```

**Network error (no code, FETCH_ERROR):**
```typescript
const NETWORK_ERROR: UserMessage = {
  title: "Couldn't reach the server",
  description: "Looks like you lost your connection. Check your internet and try again.",
};
```

**Generic 5xx fallback (no recognized code):**
```typescript
const SERVER_ERROR_TRANSIENT: UserMessage = {
  title: "Hit a snag",
  description: "Something broke on our end — not your fault. Give it a few minutes and try again.",
};

const SERVER_ERROR_PERSISTENT: UserMessage = {
  title: "Hit a snag",
  description: "Something broke on our end — not your fault. We're working on it, check back in a few hours.",
};

const UNKNOWN_ERROR: UserMessage = {
  title: "Couldn't do that",
  description: "Something went wrong. Give it another shot.",
};
```

**Lookup function:**
```typescript
interface UserMessage {
  title: string;
  description: string;
}

const getUserMessage = (
  errorCode: string | null,
  actionContext: ActionContext | null,
  httpStatus: number | null,
): UserMessage => {
  // 1. Try code + context
  if (errorCode && actionContext) {
    const codeMessages = ERROR_MESSAGES[errorCode];
    if (codeMessages?.[actionContext]) return codeMessages[actionContext];
  }

  // 2. Try code default
  if (errorCode) {
    const codeMessages = ERROR_MESSAGES[errorCode];
    if (codeMessages?._default) return codeMessages._default;
  }

  // 3. Network error
  if (httpStatus === null || errorCode === null) return NETWORK_ERROR;

  // 4. 5xx fallback with wait-time logic
  if (httpStatus >= 500) {
    return TRANSIENT_STATUS_CODES.has(httpStatus)
      ? SERVER_ERROR_TRANSIENT
      : SERVER_ERROR_PERSISTENT;
  }

  // 5. Unknown 4xx
  return UNKNOWN_ERROR;
};
```

### 3.5 Integration Pattern — How Pages Use Toasts

**For mutations (create, update, delete):**

Pages call `useToast()` and show toasts in the mutation's `onSuccess` / `onError` callbacks (or in the submit handler after `unwrap()`):

```typescript
// Example: CreateSessionPage
const { showSuccess, showError } = useToast();

const handleSubmit = async (data: CreateSessionInput) => {
  try {
    const session = await createSession(data).unwrap();
    showSuccess('Session created', `"${session.title}" is ready to go.`);
    navigate(`/sessions/${session.id}`);
  } catch (err) {
    const { code } = parseApiError(err);
    const status = extractHttpStatus(err);
    const { title, description } = getUserMessage(code, 'create-session', status);
    showError(title, description);
  }
};
```

**For queries (data loading):**

Query errors continue using inline error UI (FormError or page-level error states). Toasts are **not** used for initial page loads — a full-page error state is more appropriate than a transient toast when the whole page can't render.

**Rule:** Toasts for **actions** (mutations). Inline errors for **data loading** (queries).

### 3.6 Helper: `extractHttpStatus`

**File:** `packages/client/src/utils/error-messages.ts` (co-located)

Small helper to pull HTTP status from RTK Query error shapes:

```typescript
const extractHttpStatus = (error: unknown): number | null => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return null;
};
```

### 3.7 Success Messages by Action

Not every success needs a toast. Only actions where the user benefits from confirmation:

| Action | Toast? | Title | Description |
|--------|--------|-------|-------------|
| signup | Yes | "You're in!" | "Check your inbox — we sent you a verification link." |
| login | No | — | Page navigation is enough |
| verify-email | No | — | Redirects to success page |
| forgot-password | No | — | Inline "check your email" message stays |
| reset-password | No | — | Redirects to login with success state |
| create-session | Yes | "Created your session" | `"${title}" is ready to go.` |
| update-session | Yes | "Saved your changes" | — |
| delete-session | Yes | "Deleted that session" | — |
| upload-material | No | — | Inline upload progress is enough |
| delete-material | Yes | "Removed that material" | — |
| generate-quiz | No | — | Redirects to quiz page |
| submit-quiz | Yes | "Submitted your quiz!" | "Sit tight — your answers are being graded." |
| save-api-key | Yes | "Saved your API key" | — |
| delete-api-key | Yes | "Removed your API key" | — |

### 3.8 Files Unchanged

- **`FormError.tsx`** — stays for inline form validation display.
- **`FormField.tsx`** — stays for field-level Zod errors.
- **`ErrorBoundary.tsx`** — stays for React render crashes.
- **`error.middleware.ts`** (server) — no changes to error response format.
- **`parseApiError`** (`useApiError.ts`) — stays as the low-level parser. `getUserMessage` builds on top of it.

---

## 4. Data Model Changes

None. This is entirely a client-side feature. No database or API changes.

---

## 5. Migration / Rollout

**Phase 1 — Infrastructure (this RFC):**
1. Add toast CSS tokens to `global.css`.
2. Create `toast.constants.ts` with all configurable values.
3. Build `Toast`, `ToastContainer`, toast slice, `useToast` hook.
4. Build `error-messages.ts` with the full message map and `getUserMessage`.
5. Wire `<ToastContainer />` into `App.tsx`.

**Phase 2 — Adoption (this RFC):**
6. Update all mutation call sites (pages with `useMutation` hooks) to use `showError` / `showSuccess` with `getUserMessage`.
7. Remove redundant `FormError` usage for mutation errors (keep it only for query errors and sync validation).

**Not in this RFC:**
- Query error toasts (staying inline).
- Retry buttons in toasts.
- Notification history / center.

---

## 6. Acceptance Criteria

### No Hardcoded Values
1. All configurable values (durations, max count, z-index, viewport offset, gap, transient status codes) live in `toast.constants.ts`. No raw numbers in component or slice code.
2. All CSS dimensions and z-index values come from CSS custom properties in `global.css`. No raw `px`, `ms`, or z-index values in `.module.css` files.
3. All user-facing strings live in `error-messages.ts` (error map + fallbacks) or the success message call sites. No error copy hardcoded in components.

### Infrastructure
4. `Toast` component renders with `success`, `error`, and `warning` variants using design tokens only (no raw hex/RGB).
5. Toasts appear top-right, positioned via `var(--toast-viewport-offset)`, stack downward with `var(--toast-gap)`.
6. Max `MAX_VISIBLE_TOASTS` toasts visible. When capacity exceeded, the oldest is dismissed.
7. Auto-dismiss timers read from `TOAST_DURATIONS[variant]`.
8. Timer pauses on hover, resumes on mouse leave.
9. Close button dismisses the toast immediately.
10. Toasts slide in from right and fade out. Animation uses `--transition-base`.
11. `<ToastContainer />` renders via `createPortal()` and is mounted once in `App.tsx`.

### State Management
12. `toast.slice.ts` exposes `addToast` and `dismissToast` actions.
13. `addToast` generates a unique ID and enforces `MAX_VISIBLE_TOASTS`.
14. `useToast()` hook returns `showSuccess`, `showError`, `showWarning` functions.

### Error Message Map
15. `getUserMessage(code, context, status)` returns `{ title, description }` for every known error code.
16. Context-aware messages: same error code returns different copy depending on action context.
17. `TRANSIENT_STATUS_CODES` determines short vs long wait-time message for 5xx errors.
18. Network errors (FETCH_ERROR, no HTTP status) return the `NETWORK_ERROR` message.
19. Unknown error codes fall back to `UNKNOWN_ERROR` — never show raw backend messages.

### Adoption
20. All mutation call sites show error toasts with user-friendly messages from the map.
21. Success toasts shown for actions listed in Section 3.7.
22. `FormError` removed from mutation error paths. `FormError` still used for query errors and sync form validation.
23. No duplicate error display — each error shows in exactly one place (toast OR inline, not both).

### Accessibility
24. Toast container has `role="region"` and `aria-label="Notifications"`.
25. Each toast has `role="alert"` (for errors/warnings) or `role="status"` (for success).
26. Close button has `aria-label="Dismiss notification"`.
27. Focus is not stolen — toasts don't capture focus from the current interaction.

---

## 7. Testing Strategy

| Layer | Test | Tool |
|-------|------|------|
| Toast slice | Unit: addToast generates ID, enforces max 3, dismissToast removes | Vitest |
| Toast slice | Unit: addToast evicts oldest when at capacity | Vitest |
| getUserMessage | Unit: returns correct message for each code + context pair | Vitest |
| getUserMessage | Unit: falls back to code default when context not found | Vitest |
| getUserMessage | Unit: returns transient message for 502/503, persistent for other 5xx | Vitest |
| getUserMessage | Unit: returns network error when no status | Vitest |
| Toast component | Component: renders title, description, correct variant styling | Vitest + RTL |
| Toast component | Component: calls onDismiss when close button clicked | Vitest + RTL |
| ToastContainer | Component: renders correct number of toasts from Redux state | Vitest + RTL |
| useToast | Unit: dispatches addToast with correct variant | Vitest |
| Integration | E2E: mutation error shows toast, form validation stays inline | Playwright |

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Message map gets stale when new error codes are added | Users see generic fallback instead of helpful message | `getUserMessage` always returns a usable fallback. Add a coding convention rule: "When adding a new AppError subclass, add a matching entry to `error-messages.ts`." |
| Toast z-index conflicts with Modal | Toast hidden behind modal | `--toast-z-index` token set above `--modal-overlay-z-index` (1100 vs 1000). Both live in `global.css` so conflicts are visible in one place. |
| Auto-dismiss too fast for slow readers | User misses error message | 6s for errors is generous. Hover pauses timer. Close button available. |
| Multiple rapid failures cause toast spam | 3+ toasts at once overwhelm | Max 3 enforced. Oldest evicted. |
