# Review: toast-notifications
**Date**: 2026-03-12
**Spec file**: RFC.md
**Overall result**: Minor deviations found

## Deviations

### Network fallback classification was too broad
- **Section**: 3.4 User-Friendly Error Message Map
- **Type**: Code is wrong
- **Spec says**: Network fallback is for no-status/fetch failures; unknown codes with known status should use status-based fallback.
- **Code does**: `getUserMessage` treated `errorCode === null` as network even when HTTP status existed.
- **Root cause**: Fallback guard conflated missing code with network failure.
- **Resolution**: Use `httpStatus === null` as the network fallback trigger and keep status-based fallback behavior for known HTTP statuses.

### Duplicate error display in auth flows
- **Section**: 6 (criteria 23)
- **Type**: Code is wrong
- **Spec says**: Each error appears in exactly one place (toast OR inline).
- **Code does**: Login and verify-email failure paths showed toast plus inline recovery/error UI.
- **Root cause**: Migration added toasts without excluding existing inline UX in these two branches.
- **Resolution**: Keep inline-only handling for those branches and suppress the duplicate toast path.

### Hover pause behavior paused progress bar only
- **Section**: 3.1 Toast Component, 6 (criterion 8)
- **Type**: Code is wrong
- **Spec says**: Auto-dismiss timer pauses on hover and resumes on leave.
- **Code does**: CSS animation paused, but JavaScript timeout kept running.
- **Root cause**: Timer state and progress state were implemented separately.
- **Resolution**: Track remaining time and restart/clear timeout on hover enter/leave.

### Submit success toast fired before submit confirmation
- **Section**: 3.7 Success Messages by Action
- **Type**: Code is wrong
- **Spec says**: Success toast should confirm completed action.
- **Code does**: Success toast fired immediately when submit request started.
- **Root cause**: Success feedback tied to request dispatch, not confirmed stream start/success.
- **Resolution**: Show success only on resolved submit or confirmed SSE start sentinel.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|------------|--------|--------|
| 1. Constants in `toast.constants.ts` | Yes | Yes (`toast.slice` + imports) | Pass |
| 2. CSS values from global toast custom properties | Yes | Partial (component tests) | Pass |
| 3. User-facing error copy centralized | Yes | Yes (`error-messages.test.ts`) | Pass |
| 4. `Toast` supports success/error/warning variants | Yes | Yes (`Toast.test.tsx`) | Pass |
| 5. Top-right placement with offset and stack gap vars | Yes | Yes (`ToastContainer.test.tsx`) | Pass |
| 6. Max visible toasts with oldest eviction | Yes | Yes (`toast.slice.test.ts`) | Pass |
| 7. Auto-dismiss from `TOAST_DURATIONS` | Yes | Yes (`Toast.test.tsx`) | Pass |
| 8. Hover pauses timer, leave resumes | Yes | Partial (behavior verified in logic) | Pass |
| 9. Close button dismisses immediately | Yes | Yes (`Toast.test.tsx`) | Pass |
| 10. Slide-in/fade-out with `--transition-base` | Yes | Partial (CSS-level) | Pass |
| 11. `ToastContainer` portal mounted once in `App.tsx` | Yes | Yes | Pass |
| 12. `toast.slice.ts` exposes `addToast`/`dismissToast` | Yes | Yes (`toast.slice.test.ts`) | Pass |
| 13. `addToast` generates unique id + enforces max | Yes | Yes (`toast.slice.test.ts`) | Pass |
| 14. `useToast()` exposes `showSuccess/showError/showWarning` | Yes | Yes (`useToast.test.ts`) | Pass |
| 15. `getUserMessage` returns mapped `{title, description}` | Yes | Yes (`error-messages.test.ts`) | Pass |
| 16. Context-aware message overrides by action | Yes | Yes (`error-messages.test.ts`) | Pass |
| 17. 5xx wait-time uses `TRANSIENT_STATUS_CODES` | Yes | Yes (`error-messages.test.ts`) | Pass |
| 18. Network errors return `NETWORK_ERROR` | Yes | Yes (`error-messages.test.ts`) | Pass |
| 19. Unknown codes fall back to `UNKNOWN_ERROR` | Yes | Yes (`error-messages.test.ts`) | Pass |
| 20. All mutation call sites show error toasts | Mostly | Partial | Pass (with targeted inline exceptions) |
| 21. Success toasts shown for section 3.7 actions | Yes | Partial | Pass |
| 22. `FormError` removed from mutation error paths | Yes | Partial | Pass |
| 23. No duplicate toast+inline error display | Yes | Partial | Pass |
| 24. Container has `role=\"region\"` and label | Yes | Yes (`ToastContainer.test.tsx`) | Pass |
| 25. Each toast has correct `role` by variant | Yes | Yes (`Toast.test.tsx`) | Pass |
| 26. Dismiss button has required aria-label | Yes | Yes (`Toast.test.tsx`) | Pass |
| 27. Toasts do not steal focus | Yes | Partial | Pass |

## Lessons Learned

- During toast migration, check each mutation branch for pre-existing inline UX to avoid duplicate feedback channels.
- For timer-driven UI, pause/resume behavior should be implemented in the same timing source used for dismissal.
- Keep review artifacts updated after implementation changes to avoid stale findings in PR discussions.

## TDD Updates Required

- No TDD updates required.
