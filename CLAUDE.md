# CLAUDE.md — Project Working Brief

## What This Is
AI-Era Engineering Skills Trainer. Web app that generates critical evaluation exercises (find the bug, evaluate AI code, choose better approaches, architectural trade-offs) from user-uploaded study materials. Targets bootcamp graduates preparing for technical interviews. Solo dev + AI agents. MVP for 30 users. Monetization deferred.

## Tech Stack
- **Monorepo:** npm workspaces — `packages/shared`, `packages/server`, `packages/client`
- **Shared:** Zod schemas (single source of truth for validation + types), TypeScript types via `z.infer<>`, enums, constants
- **Frontend:** React 18 + Vite, Redux Toolkit + RTK Query, React Router DOM v6, CSS Modules, React Hook Form + Zod
- **Backend:** Node.js 20 LTS, Express.js, Prisma ORM, Zod validation, pino logger
- **Database:** PostgreSQL 16 (Docker local, Neon production). All PKs UUID. All timestamps UTC.
- **Storage:** AWS S3 (original files) + Neon `materials.extracted_text` (plain text for LLM). Quiz generation reads from Neon only — never S3.
- **LLM:** Anthropic Claude Sonnet 4 via `@anthropic-ai/sdk`. Streaming via SSE.
- **Auth:** Self-managed JWT (jsonwebtoken, 7-day expiry, localStorage) + bcryptjs (cost factor 12)
- **Email:** Resend. **Hosting:** Render (backend $7/mo, frontend free static site)

## Architecture Rules — Apply Everywhere
- **Shared package is the contract.** Zod schemas defined once in `packages/shared/src/schemas/`. Both frontend (form validation via zodResolver) and backend (route validation via validate middleware) import the same schema. Never duplicate a type that exists in shared.
- **Routes are thin.** Parse request → call service → return response. No business logic. Always use `asyncHandler()` — never try/catch in routes.
- **Services own all logic.** Never import `req`/`res`. Services throw `AppError` subclasses — never call `res.status()` from a service. Testable in isolation with mocked deps.
- **Ownership check on every protected resource.** Use `assertOwnership(model, resourceId, userId)` from `utils/ownership.ts`. Throws `NotFoundError` or `ForbiddenError`.

## Error Handling — Cross-Cutting Pattern
Both frontend and backend must know this format. Every API error response follows:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "human-readable", "details": [] } }
```
- **Backend:** Services throw `AppError` subclasses (`ValidationError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError`). Global `error.middleware.ts` is the ONLY place that formats responses. Translates Prisma errors (P2002→409, P2025→404) and ZodError (→400 with field details). 5xx: generic message to client, full stack to Sentry.
- **Frontend:** `useApiError(error)` hook extracts `{ message, code, details }` from any RTK Query error. Global 401 handler in `baseQueryWithAuth` dispatches `logout()` — never handle auth expiry in individual components.
- **SSE streams:** Pre-stream errors return normal JSON. Mid-stream errors sent as `{ type: 'error', message: '...' }` SSE event (can't send HTTP status after writeHead).

## LLM Integration — Core Product Feature
- **Prompt templates are code.** Live in `src/prompts/` as TypeScript functions. Version-controlled. Never stored in DB.
- **Two-phase prompting (single API call):** LLM outputs `<analysis>` (reasoning) then `<questions>` or `<results>` (structured JSON). Parse only the JSON block — discard analysis.
- **Validation + retry:** Every LLM response validated against Zod. On failure: retry once with corrective prompt. On second failure: error to user, log for investigation.

## Quiz Attempt Status Lifecycle
```
generating → in_progress → grading → completed
                              ↓
                       submitted_ungraded → grading (retry) → completed
```
Never skip a state. Both frontend (UI states) and backend (DB status field) must respect this lifecycle.


## File Upload Flow (Both Frontend and Backend Must Know)
```
Frontend: POST /materials/upload-url → receives presigned S3 URL + materialId
Frontend: PUT file directly to S3 (server never touches bytes)
Frontend: POST /materials/:id/process → server extracts text → stores in Neon
Generation: server reads extracted_text from Neon → sends to LLM (S3 never touched)
```

## Current Sprint
Sprint 2: Sessions & Dashboard (Week 3)
Current task: 013 — Session tests
Next task: 014 — S3 service (Sprint 3)

## Task Reference
```
Sprint 0: 001 monorepo → 002 docker+prisma → 003 express scaffold → 004 react scaffold → 005 shared package → 006 CI
Sprint 1: 007 auth backend → 008 auth frontend → 009 auth tests
Sprint 2: 010 session backend → 011 dashboard backend → 012 session+dashboard frontend → 013 session tests
Sprint 3: 014 S3 service → 015 material backend → 016 material frontend → 017 material tests
Sprint 4: 018 LLM service → 019 prompt templates → 020 quiz gen backend → 021 quiz gen frontend → 022 quiz gen tests
Sprint 5: 023 quiz taking backend → 024 quiz taking frontend → 025 grading backend → 026 results frontend → 027 quiz tests
Sprint 6: 028 error boundaries+sentry → 029 render deploy → 030 E2E tests → 031 prompt iteration → 032 launch checklist
```
