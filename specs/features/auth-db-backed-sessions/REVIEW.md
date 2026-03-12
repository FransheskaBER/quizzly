# Review: auth-db-backed-sessions

**Date**: 2026-03-13
**Spec file**: RFC.md
**Overall result**: Deviations found (1)

---

## Deviations

### Bearer fallback retained on server

- **Section**: §3.3 Auth flow (auth middleware)
- **Type**: Spec was outdated
- **Spec said**: "Read token from req.cookies.quizzly_session (fallback: Authorization: Bearer during migration, then remove)."
- **Code does**: [auth.middleware.ts](packages/server/src/middleware/auth.middleware.ts) lines 12–14 — accepts `Authorization: Bearer` as fallback when cookie is missing.
- **Resolution**: Spec updated. Bearer fallback retained for integration tests (Supertest) and API clients (curl, Postman). RFC §3.3 now documents this.

---

## Section-by-Section Verification

| Section | Spec | Code | Verdict |
|---------|------|------|---------|
| §3.1 Token model | Opaque 32-byte hex, hash in DB, cookie = raw token | `generateOpaqueAccessToken`, `hashToken`, cookie.utils | Match |
| §3.2 Schema | AccessToken model, User.accessTokens, indexes | schema.prisma | Match |
| §3.3 Login | generateOpaqueAccessToken, create row, return { user }, Set-Cookie | auth.service + auth.routes | Match |
| §3.3 Auth middleware | Cookie first, Bearer fallback, hash lookup, 401 if missing/expired | auth.middleware.ts | Match (fallback retained — see deviation) |
| §3.3 Logout | Clear cookie, optional delete row | clearSessionCookie, no row delete | Match |
| §3.4 Cookie | quizzly_session, Path /api, httpOnly, SameSite Lax, Secure prod | cookie.utils.ts | Match |
| §3.5 Client | auth.slice, api.ts, auth.api, AuthGate, useSSEStream, ProtectedRoute | All files updated | Match |
| §3.6 cookie-parser | Add middleware | app.ts | Match |
| §3.7 Removals | Remove JWT generate/verify, jsonwebtoken | Removed | Match |

---

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|-------------|--------|--------|
| Login → Set-Cookie httpOnly, no token in body | Yes | Yes (auth.routes.test.ts:151) | Pass |
| Valid cookie → GET /me 200 | Yes | Yes (auth.routes.test.ts GET /me) | Pass |
| User deleted → 401 (token CASCADE-deleted) | Yes | Yes (auth.routes.test.ts:481) | Pass |
| Logout → cookie cleared, redirect to login | Yes | Server: clearSessionCookie. Client: useAuth.logout navigates. | Pass |
| Protected route unauthenticated → redirect | Yes | Via ProtectedRoute + selectIsAuthenticated | Pass |
| SSE authenticated → stream works (credentials) | Yes | useSSEStream has credentials: 'include' | Pass |
| E2E signup → verify → login → dashboard | Yes | signupAndVerify in auth.helper.ts | Pass |
| Rollback: revert deploy → localStorage JWT works | N/A | Not testable (rollback scenario) | N/A |

**Note**: Server integration tests require DATABASE_URL, JWT_SECRET, API_KEY_ENCRYPTION_KEY. Tests were not run in this review due to missing env.

---

## Lessons Learned

- When RFC says "during migration, then remove" for a fallback, clarify scope: client only, server only, or both. Integration tests that use Supertest + Bearer are simpler than cookie-based tests; document that as a reason to retain server fallback if chosen.
- Acceptance criterion "user deleted → 401" needed an explicit test; it was added during implementation. Future RFCs should call out CASCADE/invalidation scenarios for test coverage.

---

## TDD Updates Required

Per RFC §7 (not implementation scope):

- **§6.1 Authentication Strategy**: Replace "Stateless JWT" with "DB-backed opaque session token". Token lifecycle: login creates row, cookie set; logout clears cookie. Storage: httpOnly cookie (no localStorage).
- **§5.2 Auth Endpoints**: Add POST /api/auth/logout. Update POST /api/auth/login response (no token field).
- **§6.4 CORS**: Confirm `credentials: true` documented (already present in app.ts).
