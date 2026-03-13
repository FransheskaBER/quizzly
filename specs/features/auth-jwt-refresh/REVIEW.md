# Review: auth-jwt-refresh
**Date**: 2026-03-14
**Spec file**: RFC.md
**Overall result**: Deviations found

## Deviations

### 1. Refresh failure does not clear cookies (AC #4)
- **Section**: 3.7 (Auth routes changes) / AC #4
- **Type**: Code is wrong
- **Spec says**: "POST /api/auth/refresh with expired refresh token returns 401, clears both cookies."
- **Code does**: When `refreshAccessToken()` throws `UnauthorizedError`, the error propagates to `error.middleware.ts` which returns 401 but does not clear cookies. Cookie-setting logic only executes on the success path (`auth.routes.ts:79-80`). The test at `auth.routes.test.ts:259-268` is named "clears both cookies" but only asserts `res.status === 401`.
- **Root cause**: Route handler followed the login/logout pattern where cookies are only set on success. The agent didn't account for refresh failure having a distinct cookie-clearing requirement. `asyncHandler` delegates errors to error middleware, which has no cookie awareness.
- **Resolution**: Add try/catch in the `POST /refresh` handler — on error, call `clearSessionCookie(res)` + `clearRefreshCookie(res)`, then re-throw. Update the test to assert `Set-Cookie` headers contain cleared cookies.

### 2. Frontend `/auth/me` skip not in RFC
- **Section**: 3.11 (Frontend)
- **Type**: Spec was ambiguous
- **Spec says**: "on 401 → if not the refresh endpoint itself → call POST /api/auth/refresh"
- **Code does**: Also skips refresh for `/auth/me` 401 (`api.ts:33-35`). This is correct — `/auth/me` 401 means "not logged in", not "session expired".
- **Root cause**: RFC didn't address the initial session-check scenario. The agent made the right call but the spec should have been explicit.
- **Resolution**: Update RFC Section 3.11 to add: "Skip refresh for `/auth/me` 401 (unauthenticated session check — no session to refresh)."

## Acceptance Criteria Results

| # | Criterion | Implemented | Tested | Status |
|---|-----------|------------|--------|--------|
| 1 | Login sets two httpOnly cookies: `quizzly_session` (15min) and `quizzly_refresh` (7d, path `/api/auth/refresh`) | Yes | Yes (`auth.routes.test.ts:153-180`) | Pass |
| 2 | Auth middleware verifies JWT without DB call, attaches `{ userId, email }` to `req.user` | Yes | Yes (`auth.routes.test.ts:526-597`) | Pass |
| 3 | `POST /api/auth/refresh` with valid token returns new access cookie, rotates refresh token | Yes | Yes (`auth.routes.test.ts:230-250`) | Pass |
| 4 | `POST /api/auth/refresh` with expired refresh token returns 401, clears both cookies | Partial (no cookie clearing) | No (asserts status only) | **Fail** |
| 5 | Logout clears both cookies and deletes refresh token from DB | Yes | Yes (`auth.routes.test.ts:289-316`) | Pass |
| 6 | Frontend intercepts 401, calls refresh, retries original request with mutex | Yes | Yes (`api.test.ts:46-125`) | Pass |
| 7 | Expected auth errors excluded from Sentry | Yes | By code review (project convention) | Pass |
| 8 | Signup, email verification, password reset, resend flows work unchanged | Yes | Yes (`auth.routes.test.ts:48-520`) | Pass |
| 9 | All protected routes work with JWT auth | Yes | Indirectly (helper generates JWTs) | Pass |
| 10 | Tests use `TEST_DATABASE_URL`, validate localhost, include `REFRESH_SECRET` | Yes | Self-verifying (`vitest.config.ts:7-13`) | Pass |

## Lessons Learned

- When an acceptance criterion specifies side effects on the failure path (e.g., "returns 401, clears both cookies"), the route handler needs explicit failure-path logic. `asyncHandler` + error middleware only handles response formatting, not resource cleanup like cookie clearing. Future specs should flag failure-path side effects as distinct implementation items.
- Test names that describe behavior ("clears both cookies") must have assertions that verify that behavior. A test name is a contract — if the name says it, the assertions must prove it.
- When the frontend interceptor has endpoint-specific skip logic (like `/auth/me`), the RFC should enumerate all skip conditions, not just the obvious one (refresh endpoint). Future RFCs for interceptor logic should list the full decision table.

## TDD Updates Required

No TDD updates required — RFC Section 7 already lists all TDD changes as applied.
