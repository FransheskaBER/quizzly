# Launch Checklist

Pre-launch security and performance audit. Completed for Task 032.

---

## Security Audit

| # | Requirement (from TDD) | Status | Location | Notes |
|---|------------------------|--------|----------|-------|
| 1 | JWT tokens include userId and email in payload — no extra sensitive data | PASS | `packages/server/src/utils/token.utils.ts` | TokenPayload has userId, email only |
| 2 | JWT expiry is set (7 days per TDD) | PASS | `packages/server/src/config/env.ts`, `JWT_EXPIRES_IN` default 7d | |
| 3 | Token stored in localStorage on client | PASS | `packages/client/src/store/slices/auth.slice.ts` | setCredentials stores via localStorage.setItem |
| 4 | Every protected route uses auth middleware | PASS | `session.routes.ts`, `material.routes.ts`, `quiz.routes.ts`, `dashboard.routes.ts` | All use `auth` |
| 5 | Every resource endpoint enforces ownership (resource.userId === req.user.id) | PASS | `session.service.ts`, `material.service.ts`, `quiz.service.ts` | assertOwnership() before access |
| 6 | Unauthorized access returns 403 FORBIDDEN, not 404 | PASS | `packages/server/src/utils/ownership.ts` | assertOwnership throws ForbiddenError (403) |
| 7 | bcrypt with cost factor 12 | PASS | `packages/server/src/utils/password.utils.ts` | BCRYPT_COST_FACTOR = 12 |
| 8 | No password max length enforced below 72 bytes (bcrypt truncation limit) | PASS | `packages/shared/src/schemas/auth.schema.ts` | min(8) only, no max |
| 9 | Password comparison uses bcrypt.compare (constant-time) | PASS | `packages/server/src/utils/password.utils.ts` | comparePassword uses bcrypt.compare |
| 10 | Zod validation on every route that accepts a request body | PASS | All routes with body use `validate({ body: schema })` | |
| 11 | Zod validation on route params and query strings | PASS | `validate({ params: ... })`, `validate({ query: ... })` where applicable | |
| 12 | Email lowercased on input | PASS | `packages/shared/src/schemas/auth.schema.ts` | .transform((v) => v.toLowerCase().trim()) |
| 13 | Strings trimmed | PASS | Shared schemas use .trim() | session, auth, material schemas |
| 14 | Subject truncated to 200 chars, goal to 1000 chars (TDD §1.4 Layer 1) | PASS | `packages/shared/src/constants/quiz.constants.ts` | SUBJECT_MAX_LENGTH 200, GOAL_MAX_LENGTH 1000 |
| 15 | Layer 1: Input sanitization (control characters, zero-width unicode stripped) | PASS | `packages/server/src/utils/sanitize.utils.ts` | sanitizeString, sanitizeForPrompt |
| 16 | Layer 2: User content in XML delimiter tags, post-instruction reinforcement in system prompt | PASS | `user.prompt.ts` uses `<subject>`, `<goal>`, `<materials>`; system.prompt.ts reinforces | |
| 17 | Layer 3: Zod validation on LLM output | PASS | `llm.service.ts` | llmQuizOutputSchema, llmGradedAnswersOutputSchema; SYSTEM_MARKER exfiltration check |
| 18 | Layer 4: Per-user rate limits on quiz generation | PASS | `quiz.routes.ts` | quizGenerationHourlyLimiter, quizGenerationDailyLimiter keyed by userId |
| 19 | Helmet middleware active with sensible defaults | PASS | `packages/server/src/app.ts` | app.use(helmet()) |
| 20 | CORS restricted to CLIENT_URL (not wildcard in production) | PASS | `packages/server/src/app.ts` | cors({ origin: env.CLIENT_URL }) |
| 21 | Global rate limit exists (100 req/IP/min per TDD) | PASS | `rateLimiter.middleware.ts` | globalRateLimiter 60*1000ms, 100 |
| 22 | Signup: 5/IP/hour | PASS | `auth.routes.ts` | signupLimiter 5 (100 in test for E2E) |
| 23 | Login: 10/IP/15min | PASS | `auth.routes.ts` | loginLimiter 10 per 15min |
| 24 | Quiz generation: 10/user/hour, 50/user/day | PASS | `quiz.routes.ts` | From shared constants |
| 25 | Resend verification: 3/email/hour | FIXED | `auth.routes.ts` | createRateLimiterByEmail; validate before limiter |
| 26 | Forgot password: 3/email/hour | FIXED | `auth.routes.ts` | createRateLimiterByEmail; validate before limiter |
| 27 | Presigned URLs used (server never handles file bytes) | PASS | `material.service.ts`, `s3.service.ts` | generateUploadUrl, client PUTs to S3 |
| 28 | Upload URLs expire (5 min per TDD) | PASS | `s3.service.ts` | UPLOAD_EXPIRES_IN = 300 |
| 29 | File type validation before presigned URL generation | PASS | `requestUploadUrlSchema` | fileType: z.enum(['pdf','docx','txt']) |
| 30 | File size validation (≤20MB) before presigned URL generation | PASS | `material.schema.ts` | fileSize max(MAX_FILE_SIZE_BYTES) |
| 31 | .env is in .gitignore | PASS | `.gitignore` | `.env`, `.env.*` |
| 32 | .env.example exists and documents all required variables | PASS | `.env.example` | Root file; server uses packages/server/.env |
| 33 | No secrets hardcoded in source code | PASS | grep for sk-ant, AKIA, password= in src; only test destructuring matches | |
| 34 | Environment variables validated on startup via Zod | PASS | `packages/server/src/config/env.ts` | envSchema.safeParse; exit on failure |
| 35 | npm audit — no high/critical vulnerabilities | PASS | Ran `npm audit fix`; 0 vulnerabilities | Was 2 (ajv moderate, minimatch high); fix applied |
| 36 | package-lock.json is committed | PASS | `git ls-files package-lock.json` | Tracked |

---

## Performance Review

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | RTK Query handles server state — no copying API responses into useState | PASS | `store/api.ts`, endpoints in `*api.ts`; components use hooks | |
| 2 | Redux slices minimal: auth.slice and quizStream.slice; server data in RTK Query cache | PASS | `store/store.ts` | authReducer, quizStreamReducer only |
| 3 | Route-level code splitting: React.lazy on page components with Suspense | PASS | `App.tsx` | lazy(() => import(...)) for all pages |
| 4 | React.memo on list item components (SessionCard, QuestionCard, QuestionResult) | PASS | `SessionCard.tsx`, `QuestionCard.tsx`, `QuestionResult.tsx` | Also MaterialListItem |
| 5 | SSE events batched (ref, flush every 300ms) — not per-event Redux dispatch | PASS | `useQuizGeneration.ts` | questionBufferRef, setInterval 300ms, flush on complete |
| 6 | Database queries use indexes effectively | PASS | schema.prisma indexes: userId, (userId, createdAt), sessionId, (sessionId, status), quizAttemptId, etc. | Queries filter/sort on indexed columns |
| 7 | No N+1 queries — session detail, quiz detail, results use Prisma include | PASS | `session.service.ts` getSession; `quiz.service.ts` getQuiz, getResults | include: materials, questions, answers |
| 8 | Quiz generation and grading streams use SSE correctly; connection cleanup on disconnect | PASS | `quiz.routes.ts` | req.on('close') sets clientConnected false; writer checks before send |
| 9 | Health endpoint (/api/health) exists and is lightweight | PASS | `health.routes.ts`, `health.service.ts` | Single SELECT 1 |
| 10 | No synchronous file I/O in request handlers | PASS | fs.readFileSync only in packages/server/scripts/ and tests | Not in routes/services |
| 11 | Prisma client is instantiated once (singleton) | PASS | `config/database.ts` | globalForPrisma pattern; single client |

---

## npm audit (post-fix)

```
# npm audit report (after npm audit fix)
found 0 vulnerabilities
```

Previously: 2 vulnerabilities (ajv ReDoS moderate, minimatch ReDoS high). Both addressed by `npm audit fix` without breaking changes.
