# Review: profile-refactor-api-key
**Date**: 2026-03-12
**Spec file**: `RFC.md`
**Overall result**: Clean (deviations resolved)

## Deviations

### 1) Blast radius test list missed an updated file
- **Section**: Section 4 - Blast Radius (`Tests affected`)
- **Type**: Spec is outdated
- **Spec says**: test changes are limited to `ProfilePage.test.tsx`, `SessionDashboardPage.test.tsx`, `user.routes.test.ts`, and `user.service.test.ts`.
- **Code does**: `packages/client/src/api/user.api.test.ts` was also updated to remove assertions for deleted `updateProfile` and `changePassword` endpoints.
- **Root cause**: the blast-radius table was not kept exhaustive after endpoint-hook cleanup reached RTK endpoint contract tests.
- **Resolution**: resolved by updating RFC Section 4 `Tests affected` to include `packages/client/src/api/user.api.test.ts`.

### 2) Acceptance criteria coverage is incomplete
- **Section**: Section 6 - Acceptance Criteria
- **Type**: Code is wrong
- **Spec says**: all listed UI/API behaviors should be verifiably complete for this refactor.
- **Code does**: behaviors are mostly implemented, but several criteria have no focused regression tests (Button rendering modes, progress message override/passthrough, dashboard top-bar button/logout assertions, removed-endpoint 404 assertion).
- **Root cause**: implementation changed the right files but did not maintain a criterion-to-test mapping through completion.
- **Resolution**: resolved with focused regression tests:
  - `packages/client/src/components/common/Button.test.tsx` (AC6, AC7)
  - `packages/client/src/hooks/useQuizGeneration.test.ts` (AC4, AC5)
  - `packages/client/src/pages/dashboard/HomeDashboardPage.test.tsx` (AC2, AC9)
  - `packages/server/src/routes/__tests__/user.routes.test.ts` (AC11)
  - tightened assertions in `packages/client/src/pages/profile/ProfilePage.test.tsx` (AC1) and `packages/client/src/pages/sessions/SessionDashboardPage.test.tsx` (AC3)

### 3) Required TDD follow-up remains pending
- **Section**: Section 7 - TDD Updates Required
- **Type**: Code is wrong
- **Spec says**: TDD Section 3 should document the new `Button` `to` prop behavior.
- **Code does**: no TDD update documenting `Button` `to` prop behavior is present yet.
- **Root cause**: documentation follow-up was deferred during implementation and not completed in this change set.
- **Resolution**: resolved by updating `specs/TDD.md` Section 3 project structure note to document the shared `Button` `to` prop behavior.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|---|---|---|---|
| 1. `/profile` heading is "Your API Key" and only API key section renders | Yes | Yes (`packages/client/src/pages/profile/ProfilePage.test.tsx`) | Pass |
| 2. Dashboard top bar uses ghost `Button` for "Your API Key" and "Log out" | Yes | Yes (`packages/client/src/pages/dashboard/HomeDashboardPage.test.tsx`) | Pass |
| 3. Trial-exhausted CTA shows exact copy + "Add API key" button to `/profile` | Yes | Yes (`packages/client/src/pages/sessions/SessionDashboardPage.test.tsx`) | Pass |
| 4. "Analyzing materials..." is shown as "Generating your quiz..." client-side | Yes | Yes (`packages/client/src/hooks/useQuizGeneration.test.ts`) | Pass |
| 5. "Generating question X/Y..." progress text is shown unchanged | Yes | Yes (`packages/client/src/hooks/useQuizGeneration.test.ts`) | Pass |
| 6. `Button` with `to` renders a `<Link>` with button classes | Yes | Yes (`packages/client/src/components/common/Button.test.tsx`) | Pass |
| 7. `Button` without `to` renders a `<button>` unchanged | Yes | Yes (`packages/client/src/components/common/Button.test.tsx`) | Pass |
| 8. API key save/delete on `/profile` works unchanged | Yes | Yes (`packages/client/src/pages/profile/ProfilePage.test.tsx`, `packages/server/src/routes/__tests__/user.routes.test.ts`, `packages/server/src/services/__tests__/user.service.test.ts`) | Pass |
| 9. Dashboard logout behavior unchanged | Yes | Yes (`packages/client/src/pages/dashboard/HomeDashboardPage.test.tsx`) | Pass |
| 10. Forgot/reset password flow unchanged | Yes | Yes (`packages/server/src/routes/__tests__/auth.routes.test.ts`) | Pass |
| 11. `PATCH /api/users/profile` and `PUT /api/users/password` return 404 | Yes | Yes (`packages/server/src/routes/__tests__/user.routes.test.ts`) | Pass |
| 12. Git revert restores prior behavior | Not validated in implementation review | No (operational rollback criterion) | Gap |

## Lessons Learned

- Keep the blast-radius table exhaustive, including test files indirectly impacted by API hook removals.
- Track acceptance criteria with an explicit criterion-to-test checklist before declaring an RFC complete.
- When shared components gain capabilities, include the TDD doc update in the same completion checklist as code and tests.

## TDD Updates Required

- No TDD updates required.
