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

## CI Pipeline Rules
- **Pre-push checklist (every task):** Before committing, always run locally and verify zero errors: `npm run lint`, `npx tsc --noEmit` in both server and client packages, and `npm test` (full suite). Never push code that fails any of these locally.
- **CI Postgres credentials:** The Postgres service container in `ci.yml` uses `POSTGRES_USER: skills_test`, `POSTGRES_PASSWORD: skills_test`, `POSTGRES_DB: skills_trainer_test`. The `DATABASE_URL` used in both the migrate and test steps is `postgresql://skills_test:skills_test@localhost:5432/skills_trainer_test`. These must always stay in sync — if one changes, update the other.
- **Prisma in CI:** `npx prisma generate` must run before both typecheck and tests. Prisma's postinstall during `npm ci` does not find the schema in a monorepo workspace, so the client is a stub until `generate` is run explicitly. A stub client means query methods like `findMany` return `any` — TypeScript then cannot infer map callback parameter types, and `noImplicitAny` fails with TS7006. Do not add explicit annotations to work around this; fix the step order instead. `npx prisma migrate deploy` must run before tests (needs the DB) but does not need to precede typecheck. Current order in `ci.yml`: `npm ci` → `prisma generate` → lint → typecheck → `prisma migrate deploy` → tests. Don't remove or reorder these steps. If you modify the Prisma schema, verify both steps still work.
- **CI environment updates:** Any task that introduces new test infrastructure — service containers, new environment variables, new generated files, or new test dependencies — must update `ci.yml` as part of that task. Do not leave CI updates for a separate PR.
- **Test helpers:** Reusable test infrastructure lives in `packages/server/src/__tests__/helpers/`. Reuse `createTestUser()`, `getAuthToken()`, `createUnverifiedUser()`, `cleanDatabase()`, and `closeDatabase()`. Do not duplicate these. If a new helper is needed, add it to the existing helpers directory.
- **Environment mismatches:** If CI fails on something that passes locally, check: database credentials, generated files (Prisma client), and platform-specific dependencies (rollup native binaries). The fix is always to align CI with what the code expects, not the other way around.
