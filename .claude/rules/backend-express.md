# Backend Express Rules

## Route Pattern — Every Route Follows This Structure
```typescript
router.post('/:id/submit', auth, validate(submitQuizSchema), asyncHandler(async (req, res) => {
  const result = await quizService.submitAndGrade(req.params.id, req.body, req.user.id);
  res.status(200).json(result);
}));
```
- Always wrap with `asyncHandler()` from `utils/asyncHandler.ts`. Never write try/catch in routes.
- Always chain: `auth` → `validate(schema)` → `asyncHandler(handler)`. Order matters.
- Routes only: parse request, call one service method, return response. Zero business logic.
- Never import Prisma in a route file. Never call `res.status().json()` inside a catch block.

## Middleware
- `validate(schema)` parses `{ body: req.body, params: req.params, query: req.query }` against a Zod schema. Throws ZodError on failure — global error middleware handles it.
- `auth` middleware extracts JWT from `Authorization: Bearer <token>`, verifies via `jsonwebtoken`, attaches `req.user = { id, email }`. Throws `UnauthorizedError` on failure.
- All errors flow to `error.middleware.ts` — the ONLY place that calls `res.status().json({ error: { code, message, details? } })`.

## Rate Limits (express-rate-limit)
- Global: 100 req/IP/min. Signup: 5/IP/hr. Login: 10/IP/15min. Resend verification: 3/email/hr. Forgot password: 3/email/hr. Quiz generation: 10/user/hr + 50/user/day.

## SSE Streaming — Quiz Generation & Grading
```typescript
// Validate auth + params BEFORE opening stream. Return JSON errors for pre-stream failures.
res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
// Progress: res.write(`data: ${JSON.stringify({ type: 'progress', message: '...' })}\n\n`);
// Data:     res.write(`data: ${JSON.stringify({ type: 'question', data: question })}\n\n`);
// Done:     res.write(`data: ${JSON.stringify({ type: 'complete', data: { quizAttemptId } })}\n\n`); res.end();
// Error:    res.write(`data: ${JSON.stringify({ type: 'error', message: '...' })}\n\n`); res.end();
```
- 120s server-side timeout. Mid-stream errors sent as SSE events (can't send HTTP status after `writeHead`).
- Never send `correctAnswer` or `explanation` in generation stream — only on results endpoint after completion.

## API Conventions
- Base URL: `/api`. All responses JSON except SSE. Pagination: `?cursor=<uuid>&limit=<int>` (default 20, max 50).
- Response errors: `{ error: { code: 'VALIDATION_ERROR', message: 'human-readable', details?: [...] } }`. Consistent on every endpoint.
- HTTP status usage: 201 for resource creation, 204 for deletes (no body), 200 for everything else. Never 200 for creation.
- Security responses: login failure always says "Invalid email or password" (never reveal which). Resend verification / forgot password always return 200 (never reveal if email exists).
- UUIDs only in URLs. Never expose sequential IDs. No verbs in paths — RESTful nouns only.

## Environment Variables
- All vars validated on startup via Zod schema in `config/env.ts`. Server refuses to start if any are missing or malformed.
- Required: `NODE_ENV`, `PORT`, `CLIENT_URL`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`.
- Access via validated config object (`import { env } from '@server/config/env'`), never raw `process.env`.
