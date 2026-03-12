# Review: toast-notifications
**Date**: 2026-03-12
**Spec file**: RFC.md
**Overall result**: Deviations found

## Deviations

### RFC implementation missing across scope
- **Section**: 2. Scope
- **Type**: Code is wrong
- **Spec says**: Implement a custom toast system (component + container), Redux toast slice, `useToast` hook, user-friendly error message mapping, and mutation-path adoption for success/error feedback.
- **Code does**: No toast system files or integration exist yet. No `Toast`, `ToastContainer`, `toast.slice`, `useToast`, or `error-messages.ts` implementation is present.
- **Root cause**: RFC implementation was not started in code; current client still follows pre-RFC error/success feedback patterns.
- **Resolution**: Implement all scoped artifacts and adoption points exactly as defined in RFC sections 3.0-3.8 and 5.

### Detailed design artifacts are absent
- **Section**: 3. Detailed Design
- **Type**: Code is wrong
- **Spec says**: Add `toast.constants.ts`, toast components/CSS modules, store integration, `useToast`, `getUserMessage`, `extractHttpStatus`, and mount `ToastContainer` in `App.tsx`.
- **Code does**: Required files and app wiring are missing; `App.tsx` has no toast container, `store.ts` has no `toast` reducer, and `global.css` has no toast CSS tokens.
- **Root cause**: Detailed design was documented but not implemented.
- **Resolution**: Create the specified files, wire reducer and container, and add toast design tokens to `global.css`.

### Rollout phases not executed
- **Section**: 5. Migration / Rollout
- **Type**: Code is wrong
- **Spec says**: Execute Phase 1 (infrastructure) and Phase 2 (mutation adoption).
- **Code does**: Neither phase is reflected in current code; mutation handlers still use inline/raw message flows.
- **Root cause**: RFC rollout plan was not applied.
- **Resolution**: Implement Phase 1 fully first, then migrate all mutation call sites per Phase 2.

### Acceptance criteria remain unmet
- **Section**: 6. Acceptance Criteria
- **Type**: Code is wrong
- **Spec says**: 27 criteria covering constants, UI behavior, state, message mapping, adoption, and accessibility must be satisfied.
- **Code does**: Criteria are currently unmet because required infrastructure and call-site migration are absent.
- **Root cause**: Feature implementation not yet delivered.
- **Resolution**: Implement and verify every criterion; block completion until all are covered by tests.

### Toast-focused tests are missing
- **Section**: 7. Testing Strategy
- **Type**: Code is wrong
- **Spec says**: Add unit/component tests for slice, message map, toast components/container, hook, and E2E mutation error behavior.
- **Code does**: Existing tests target unrelated features; there are no toast-specific tests.
- **Root cause**: Test plan was not executed because feature code is missing.
- **Resolution**: Add all tests listed in RFC section 7, including E2E verification that mutation failures show toasts while sync validation remains inline.

### Risk mitigation not implemented
- **Section**: 8. Risks and Mitigations
- **Type**: Code is wrong
- **Spec says**: Ensure message-map fallback coverage so users never see raw backend errors; add convention to update message map when new error codes are introduced.
- **Code does**: No message map exists yet, so fallback protection and convention linkage are absent.
- **Root cause**: Dependency on unimplemented section 3.4.
- **Resolution**: Implement `getUserMessage` fallback chain and enforce map maintenance with a workspace rule.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|------------|--------|--------|
| 1. Constants in `toast.constants.ts` | No | No | Gap |
| 2. CSS values from global toast custom properties | No | No | Gap |
| 3. User-facing error copy centralized | No | No | Gap |
| 4. `Toast` supports success/error/warning variants | No | No | Gap |
| 5. Top-right placement with offset and stack gap vars | No | No | Gap |
| 6. Max visible toasts with oldest eviction | No | No | Gap |
| 7. Auto-dismiss from `TOAST_DURATIONS` | No | No | Gap |
| 8. Hover pauses timer, leave resumes | No | No | Gap |
| 9. Close button dismisses immediately | No | No | Gap |
| 10. Slide-in/fade-out with `--transition-base` | No | No | Gap |
| 11. `ToastContainer` portal mounted once in `App.tsx` | No | No | Gap |
| 12. `toast.slice.ts` exposes `addToast`/`dismissToast` | No | No | Gap |
| 13. `addToast` generates unique id + enforces max | No | No | Gap |
| 14. `useToast()` exposes `showSuccess/showError/showWarning` | No | No | Gap |
| 15. `getUserMessage` returns mapped `{title, description}` | No | No | Gap |
| 16. Context-aware message overrides by action | No | No | Gap |
| 17. 5xx wait-time uses `TRANSIENT_STATUS_CODES` | No | No | Gap |
| 18. Network errors return `NETWORK_ERROR` | No | No | Gap |
| 19. Unknown codes fall back to `UNKNOWN_ERROR` | No | No | Gap |
| 20. All mutation call sites show error toasts | No | No | Gap |
| 21. Success toasts shown for section 3.7 actions | No | No | Gap |
| 22. `FormError` removed from mutation error paths | No | No | Gap |
| 23. No duplicate toast+inline error display | No | No | Gap |
| 24. Container has `role="region"` and label | No | No | Gap |
| 25. Each toast has correct `role` by variant | No | No | Gap |
| 26. Dismiss button has required aria-label | No | No | Gap |
| 27. Toasts do not steal focus | No | No | Gap |

## Lessons Learned

- Add a completion gate for RFC/SPEC implementation: do not mark a feature complete until every acceptance criterion is mapped to at least one test.
- Require mutation UX audits for frontend RFCs: success/error feedback paths must be explicitly traced and verified page-by-page.
- When adding new backend error codes, update the frontend user-message map in the same change.

## TDD Updates Required

- No TDD updates required from this review. The issue is implementation non-delivery, not architectural drift from the current TDD.
