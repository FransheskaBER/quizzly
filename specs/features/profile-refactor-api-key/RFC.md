# RFC: Profile Page Refactor — API Key Focus + UI Fixes

**Date**: 2026-03-12
**Status**: Reviewed - Complete
**Type**: Refactor / Removal
**TDD Updates Required**: No

---

## 1. Context

The profile page (`/profile`) currently has three sections: Username, Password, and API Key.
Username and password editing are being removed — password changes happen only via the
forgot-password flow on the login page. The page becomes a focused API key management page.

Additionally:
- The trial-exhausted CTA in the session page is vague and lacks a clear action button.
- The quiz generation progress message "Analyzing materials..." is misleading when no materials exist.
- The dashboard top bar uses raw HTML elements instead of the shared `Button` component, violating styling rules.

## 2. Goals and Non-Goals

### Goals
1. Rename profile page to "Your API Key" — heading, nav link label.
2. Remove Username and Password sections from the page UI.
3. Remove `PATCH /api/users/profile` and `PUT /api/users/password` backend endpoints.
4. Remove `useUpdateProfileMutation` and `useChangePasswordMutation` RTK Query hooks.
5. Remove `updateProfileSchema`, `changePasswordSchema`, `UpdateProfileRequest`, `ChangePasswordRequest` from shared package.
6. Update trial-exhausted CTA: "To generate more quizzes, add your Anthropic key." with an "Add API key" `Button` linking to `/profile`.
7. Override "Analyzing materials..." progress message client-side to "Generating your quiz...".
8. Fix dashboard top bar: replace raw `<Link>` and `<button>` with shared `Button` component (`ghost` variant).
9. Extend `Button` component with a `to` prop that renders a React Router `<Link>`.

### Non-Goals
- No route path change — `/profile` stays.
- No server-side progress message changes.
- No changes to `ApiKeySection` component logic.
- No changes to forgot-password / reset-password auth flow.
- No changes to `getApiKeyStatus`, `saveApiKey`, `deleteApiKey` endpoints.

## 3. Detailed Design

### 3.1 Extend `Button` component

**File:** `packages/client/src/components/common/Button.tsx`

Add optional `to?: string` prop. When provided, render a React Router `<Link>` with the same
CSS classes (`btn`, variant, size). When omitted, render `<button>` (existing behavior).

Button props when `to` is set should omit `ButtonHTMLAttributes` and use only the shared
visual props (`variant`, `size`, `className`, `children`).

**Why `to` and not `as` or `href`:** Project uses React Router exclusively. A polymorphic `as`
prop is over-engineering. `to` is the React Router convention.

### 3.2 Simplify ProfilePage

**File:** `packages/client/src/pages/profile/ProfilePage.tsx`

- Delete `UsernameSection` component and all its imports.
- Delete `PasswordSection` component and all its imports (`changePasswordFormSchema`, `ChangePasswordFormValues`).
- Page renders only `ApiKeySection` with heading "Your API Key".
- Keep `← Dashboard` back link.

### 3.3 Remove backend endpoints

**File:** `packages/server/src/routes/user.routes.ts`
- Remove `PATCH /users/profile` route.
- Remove `PUT /users/password` route.
- Remove unused imports.

**File:** `packages/server/src/services/user.service.ts`
- Remove `updateProfile` function.
- Remove `changePassword` function.
- Remove unused imports (`UpdateProfileRequest`, `ChangePasswordRequest`, `UserResponse`, `MessageResponse`, `hashPassword`, `comparePassword`).

### 3.4 Remove RTK Query hooks

**File:** `packages/client/src/api/user.api.ts`
- Remove `updateProfile` and `changePassword` endpoint definitions.
- Remove `useUpdateProfileMutation` and `useChangePasswordMutation` exports.
- Remove unused shared type imports.

### 3.5 Clean up shared package

**File:** `packages/shared/src/schemas/user.schema.ts`
- Remove `updateProfileSchema` and `changePasswordSchema`.
- Remove `USERNAME_MAX_LENGTH` import if only used here.

**File:** `packages/shared/src/types/index.ts`
- Remove re-exports and inferred types for the above schemas.

**File:** `packages/shared/src/index.ts`
- Remove all exports for removed schemas and types.

### 3.6 Update trial-exhausted CTA

**File:** `packages/client/src/pages/sessions/SessionDashboardPage.tsx` (lines 310-314)

```tsx
// Before
<p>To generate more quizzes, save your Anthropic API key in your{' '}
  <Link to="/profile">profile</Link>.</p>

// After
<p>To generate more quizzes, add your Anthropic key.{' '}
  <Button to="/profile" variant="primary" size="sm">Add API key</Button></p>
```

### 3.7 Override progress message (client-side)

**File:** `packages/client/src/hooks/useQuizGeneration.ts` (line 71)

```tsx
if (event.type === 'progress' && typeof event.message === 'string') {
  const displayMessage = event.message === 'Analyzing materials...'
    ? 'Generating your quiz...'
    : event.message;
  setProgressMessage(displayMessage);
  return;
}
```

### 3.8 Fix dashboard top bar styling

**File:** `packages/client/src/pages/dashboard/HomeDashboardPage.tsx`

```tsx
// Before
<Link to="/profile" className={styles.profileLink}>Profile</Link>
<button type="button" className={styles.logoutBtn} onClick={logout}>Log out</button>

// After
<Button to="/profile" variant="ghost" size="sm">Your API Key</Button>
<Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
```

**File:** `packages/client/src/pages/dashboard/HomeDashboardPage.module.css`
- Remove `.profileLink` class.
- Remove `.logoutBtn` and `.logoutBtn:hover` classes.

## 4. Blast Radius

### Files directly modified
| File | Change |
|---|---|
| `packages/client/src/components/common/Button.tsx` | Add `to` prop |
| `packages/client/src/pages/profile/ProfilePage.tsx` | Remove 2 sections, update heading |
| `packages/client/src/pages/profile/ProfilePage.module.css` | Remove orphaned styles |
| `packages/client/src/pages/sessions/SessionDashboardPage.tsx` | Update CTA |
| `packages/client/src/pages/dashboard/HomeDashboardPage.tsx` | Use Button component |
| `packages/client/src/pages/dashboard/HomeDashboardPage.module.css` | Remove 2 classes |
| `packages/client/src/api/user.api.ts` | Remove 2 endpoints |
| `packages/client/src/hooks/useQuizGeneration.ts` | Override progress message |
| `packages/server/src/routes/user.routes.ts` | Remove 2 routes |
| `packages/server/src/services/user.service.ts` | Remove 2 functions |
| `packages/shared/src/schemas/user.schema.ts` | Remove 2 schemas |
| `packages/shared/src/types/index.ts` | Remove re-exports and types |
| `packages/shared/src/index.ts` | Remove exports |

### Tests affected
| Test File | Change |
|---|---|
| `packages/client/src/pages/profile/ProfilePage.test.tsx` | Remove AC7 + telemetry tests for username/password; update mocks |
| `packages/client/src/pages/sessions/SessionDashboardPage.test.tsx` | Update BYOK CTA test — new text + Button link |
| `packages/client/src/api/user.api.test.ts` | Remove endpoint contract assertions for deleted `updateProfile` and `changePassword` endpoints |
| `packages/server/src/routes/__tests__/user.routes.test.ts` | Remove PATCH profile + PUT password describes |
| `packages/server/src/services/__tests__/user.service.test.ts` | Remove updateProfile + changePassword describes |

## 5. Migration / Rollback

### Migration
- **Strategy:** Single PR, big bang. All changes are coupled.
- **Sequence:** Button extension → ProfilePage simplify → Dashboard top bar → CTA update → Progress message → RTK hooks → Server routes/services → Shared schemas → Tests → Lint/typecheck/test.
- **Data migration:** None.
- **Backwards compatibility:** Not needed. Clean removal.

### Rollback
- **Trigger:** Tests fail post-deploy or API key page is broken.
- **Steps:** Git revert the PR.
- **Data safety:** No data changes. Clean revert.

## 6. Acceptance Criteria

### Success
1. **Given** a logged-in user **When** they visit `/profile` **Then** heading is "Your API Key" and only the API key section renders.
2. **Given** the dashboard top bar **When** rendered **Then** "Your API Key" and "Log out" both use `Button` ghost variant with consistent styling.
3. **Given** trial exhausted + no API key **When** on session page **Then** shows "To generate more quizzes, add your Anthropic key." with "Add API key" button (primary, sm) linking to `/profile`.
4. **Given** quiz generation with no materials **When** server sends "Analyzing materials..." **Then** client displays "Generating your quiz...".
5. **Given** quiz generation **When** server sends "Generating question X/Y..." **Then** client displays as-is.
6. **Given** `Button` with `to` prop **When** rendered **Then** outputs a `<Link>` with button CSS classes.
7. **Given** `Button` without `to` prop **When** rendered **Then** outputs a `<button>` (unchanged).

### Regression
8. **Given** API key save/delete on `/profile` **Then** works unchanged.
9. **Given** dashboard "Log out" click **Then** logs out unchanged.
10. **Given** forgot-password flow **Then** `POST /auth/forgot-password` and `POST /auth/reset-password` work unchanged.
11. **Given** request to `PATCH /api/users/profile` or `PUT /api/users/password` **Then** returns 404.

### Rollback
12. **Given** git revert **When** deployed **Then** profile page shows all 3 sections, dashboard shows "Profile" link, old CTA text, both endpoints restored.

## 7. TDD Updates Required (not implementation scope)

- **TDD Section 5**: Remove `PATCH /api/users/profile` and `PUT /api/users/password` endpoint documentation — *Reason: endpoints removed (Design 3.3)*.
- **TDD Section 3**: Document `Button` component `to` prop for `<Link>` rendering — *Reason: new shared component capability (Design 3.1)*.
