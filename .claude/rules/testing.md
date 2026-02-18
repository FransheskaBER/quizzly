# Testing Rules

## Tools & Layers
- **Unit tests:** Vitest. Cover services, utils, shared schemas. Mock all external deps (Prisma, S3, Anthropic, Resend) via `vitest-mock-extended`.
- **Integration tests:** Vitest + Supertest. Full request → middleware → service → DB → response. Run against real Postgres (Docker locally, service container in CI). Mock only: Anthropic SDK, S3 client, Resend client.
- **E2E tests:** Playwright. 5 tests covering critical happy paths only. Run against production after deploy. Mock Anthropic API to return predetermined quiz JSON. Never test error cases in E2E — too slow, too flaky.
- **Component tests:** Vitest + React Testing Library. Key interactive behaviors only: form submission, quiz navigation, MCQ selection, error display.

## What Gets Mocked — Non-Negotiable
- **LLM (Anthropic):** ALWAYS mocked in every test type. Never call real Anthropic — non-deterministic, expensive, slow. Real LLM testing is manual (BL-013).
- **S3:** Mocked in unit and integration tests. Mock presigned URL generation to return fake URLs. Mock upload/download/delete to no-op.
- **Email (Resend):** Mocked. Capture sent emails in memory array. Assert: correct recipient, subject, token in body.
- **Database:** NEVER mocked in integration tests. Real Postgres via Docker. Fresh migration in `beforeAll`, truncate tables in `afterEach` (not `afterAll` — tests must be independent).

## Coverage & Quality
- 80% minimum on `packages/server/src/services/` and `packages/server/src/utils/`. Measured via Vitest coverage with v8 provider.
- Every bug fix: write a failing test FIRST (red) that reproduces the bug. Fix the code (green). Test stays in suite permanently.
- Failing tests block deployment. CI runs lint → typecheck → unit → integration → build. All must pass for PR merge.

## File Locations — Co-located With Source
```
packages/server/src/services/__tests__/auth.service.test.ts
packages/server/src/services/__tests__/quiz.service.test.ts
packages/server/src/routes/__tests__/auth.routes.test.ts      # integration
packages/server/src/utils/__tests__/password.utils.test.ts
packages/client/src/components/quiz/__tests__/QuestionCard.test.tsx
packages/client/e2e/signup-verify-login.spec.ts                # Playwright
```

## Integration Test Setup Pattern
```typescript
// In each *.routes.test.ts file
beforeAll(async () => { await prisma.$executeRawUnsafe('-- run migrations'); });
afterEach(async () => { await prisma.user.deleteMany(); /* truncate in dependency order */ });
afterAll(async () => { await prisma.$disconnect(); });
```
