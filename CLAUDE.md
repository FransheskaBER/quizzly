# CLAUDE.md — Project Working Brief

## 1. Project Overview

Web app that generates quiz questions from user-uploaded study materials for technical skill practice. Solo-dev MVP, 30-user target. Monorepo: `packages/shared`, `packages/server`, `packages/client` as npm workspaces.

## 2. Tech Stack

- **Monorepo:** npm workspaces — `packages/shared`, `packages/server`, `packages/client`
- **Shared:** Zod schemas (single source of truth for validation + types), TypeScript types via `z.infer<>`, enums, constants
- **Frontend:** React 18 + Vite, Redux Toolkit + RTK Query, React Router DOM v6, CSS Modules, React Hook Form + Zod
- **Backend:** Node.js 20 LTS, Express.js, Prisma ORM, Zod validation, pino logger
- **Database:** PostgreSQL 16 (Docker local, Neon production). All PKs UUID. All timestamps UTC.
- **Storage:** AWS S3 (original files) + Neon `materials.extracted_text` (plain text for LLM). Quiz generation reads from Neon only — never S3.
- **LLM:** Anthropic Claude Sonnet 4 via `@anthropic-ai/sdk`. Streaming via SSE.
- **Auth:** Self-managed JWT (jsonwebtoken, 7-day expiry, localStorage) + bcryptjs (cost factor 12)
- **Email:** Resend. **Hosting:** Render (backend $7/mo, frontend free static site)

Do not add new dependencies without explicit approval. Use what's listed.
Pin to the versions specified: Node.js 20 LTS, React 18, PostgreSQL 16, Prisma (latest stable).
If a task requires a library not listed here, stop and ask before proceeding.

## 3. Architecture Rules

### 3A: Code Quality Conventions

Enable TypeScript strict mode everywhere. Never use `any` unless a specific inline comment justifies it.
Never use magic strings or numbers. Extract cross-package values to `packages/shared/src/constants/`; extract file-scoped values to a local `const`.
Every function does one thing. Split any function that handles two concerns.
Never duplicate types, schemas, constants, or utilities across packages. If both server and client need it, it lives in `packages/shared/`.
Never duplicate logic within a package. Extract repeated Prisma query patterns into shared helpers in `src/utils/`.
Import order: shared package imports first, then external dependencies, then local modules. Separate each group with a blank line.
All error messages must be actionable — state what the user must do, not just what went wrong.
Use early returns instead of nested conditionals.
Never commit commented-out code. Remove it.
Never use `console.log` on the server. Use pino logger for all server-side logging. Frontend may use `console.error` only inside error boundaries.

### 3B: Architectural Boundaries

**Routes:**
- Must contain no business logic. Parse request → call service → return response.
- Must never import or call Prisma directly.
- Must never contain try/catch blocks. Wrap every route handler in `asyncHandler()`.
- Must never format error responses. Return the service result and let Express serialize it.

**Services:**
- Must never import `req`, `res`, or any Express types.
- Must never call `res.status().json()` or format HTTP responses.
- Must call `assertOwnership()` from `utils/ownership.ts` for every protected resource access.
- Are the only layer that throws `AppError` subclasses.
- May call Prisma directly. Extract complex or reused query patterns into private helper functions within the same service file.

**Shared package:**
- Must never import from `packages/server` or `packages/client`.
- Zod schemas are the single source of truth for all validation. Both frontend and backend import from `@skills-trainer/shared`. Never duplicate a schema.
- All types must be derived from Zod schemas via `z.infer<>`. Never manually write a type that a schema already defines.

**Frontend components:**
- Must never make direct API calls (no `fetch`, no `axios`). All server communication goes through RTK Query hooks.
- Must contain no business logic. Components render UI and call hooks.

**Middleware:**
- `error.middleware.ts` is the only place that formats error responses. No other file calls `res.status().json()` for errors.
- `validate.middleware.ts` is the only place that runs Zod parsing on request input.
- `auth.middleware.ts` is the only place that extracts and verifies JWT tokens.

**General:**
- Never hardcode URLs, ports, API keys, or environment-specific values. All come from `src/config/env.ts`, which validates via Zod on startup.
- Database columns use `snake_case` in Postgres via `@map()`. Prisma model fields use `camelCase`. Application code only ever sees `camelCase`.

### 3C: Testing Conventions

Co-locate tests with source: `services/__tests__/auth.service.test.ts`.
Place E2E tests in `packages/client/e2e/`.
Test services with mocked external dependencies (Prisma, S3, Anthropic, Resend).
Integration tests must run against real Postgres via Docker. Never mock the database in integration tests.
Mock LLM responses in all test environments (unit, integration, E2E). Never make real Anthropic API calls in tests.
Every bug fix must include a regression test that fails without the fix and passes with it.
Maintain 80% minimum coverage on all files in `packages/server/src/services/`.
Name test files `[source-filename].test.ts`.
Name `describe` blocks after the function or method under test. Write `it` blocks as behavior descriptions: `it('throws NotFoundError when session does not exist')`.

## 4. Error Handling

Both frontend and backend must know this format. Every API error response follows:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "human-readable", "details": [] } }
```
- **Backend:** Services throw `AppError` subclasses (`ValidationError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError`). Global `error.middleware.ts` is the ONLY place that formats responses. Translates Prisma errors (P2002→409, P2025→404) and ZodError (→400 with field details). 5xx: generic message to client, full stack to Sentry.
- **Frontend:** `useApiError(error)` hook extracts `{ message, code, details }` from any RTK Query error. Global 401 handler in `baseQueryWithAuth` dispatches `logout()` — never handle auth expiry in individual components.
- **SSE streams:** Pre-stream errors return normal JSON. Mid-stream errors sent as `{ type: 'error', message: '...' }` SSE event (can't send HTTP status after writeHead).

Never throw raw `Error`. Always use an `AppError` subclass.
Never catch an error and swallow it silently. Either rethrow, log, or handle explicitly.
4xx errors must include an actionable message for the user. 5xx errors send a generic message to the client and full details to Sentry and pino logs.
SSE mid-stream errors: send `{ type: 'error', message }` event, close the stream, and update the DB status to reflect the failure state.

## 5. LLM Integration

- **Prompt templates are code.** Live in `src/prompts/` as TypeScript functions. Version-controlled. Never stored in DB.
- **Two-phase prompting (single API call):** LLM outputs `<analysis>` (reasoning) then `<questions>` or `<results>` (structured JSON). Parse only the JSON block — discard analysis.
- **Validation + retry:** Every LLM response validated against Zod. On failure: retry once with corrective prompt. On second failure: error to user, log for investigation.

Prompt template functions are pure functions — no side effects, no database calls, no imports from services.
All user content must pass through `sanitize.utils.ts` before injection into prompt strings. Never concatenate unvalidated user input directly into a prompt.

## 6. Quiz Attempt Status Lifecycle

```
generating → in_progress → grading → completed
                              ↓
                       submitted_ungraded → grading (retry) → completed
```
Never skip a state. Both frontend (UI states) and backend (DB status field) must respect this lifecycle.

## 7. File Upload Flow

```
Frontend: POST /materials/upload-url → receives presigned S3 URL + materialId
Frontend: PUT file directly to S3 (server never touches bytes)
Frontend: POST /materials/:id/process → server extracts text → stores in Neon
Generation: server reads extracted_text from Neon → sends to LLM (S3 never touched)
```

## 8. Current Sprint

Sprint 6: Polish & Deploy (Week 6-7)
Current task: 029 — Render deployment (backend + frontend, env vars, health check)
Next task: 030 — E2E tests (5 Playwright tests)

## 9. Task Reference

```
Sprint 0: 001 monorepo → 002 docker+prisma → 003 express scaffold → 004 react scaffold → 005 shared package → 006 CI
Sprint 1: 007 auth backend → 008 auth frontend → 009 auth tests
Sprint 2: 010 session backend → 011 dashboard backend → 012 session+dashboard frontend → 013 session tests
Sprint 3: 014 S3 service → 015 material backend → 016 material frontend → 017 material tests
Sprint 4: 018 LLM service → 019 prompt templates → 020 quiz gen backend → 021 quiz gen frontend → 022 quiz gen tests
Sprint 5: 023 quiz taking backend → 024 quiz taking frontend → 025 grading backend → 026 results frontend → 027 quiz tests
Sprint 6: 028 error boundaries+sentry → 029 render deploy → 030 E2E tests → 031 prompt iteration → 032 launch checklist
```
