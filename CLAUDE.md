# Quizzly

LLM-powered skills training platform for software engineers

## Tech Stack

- Frontend:
├── Framework: React 18 with Vite — Fast builds, developer familiarity, Vite is modern standard
├── State Management: Redux Toolkit (RTK) + RTK Query — Developer specified Redux. RTK Query
│   handles API caching/fetching, eliminates boilerplate for server state.
├── Routing: React Router DOM v6 — Developer specified. Standard choice.
├── Styling: CSS Modules — Plain CSS scoped per component. Enables paste-in styling from
│   external tools (Gemini). global.css for resets and CSS variables.
├── Form Handling: React Hook Form + Zod — Lightweight forms. Zod schemas shared with backend.
├── Markdown/Code Rendering: react-markdown + react-syntax-highlighter — Quiz questions contain
│   code snippets needing proper rendering.
├── Rejected alternatives:
│   - Next.js: SSR overkill for authenticated SPA. No SEO benefit. Adds complexity.
│   - Tailwind: Adds translation layer vs plain CSS from Gemini. Unnecessary friction.
│   - MUI/Chakra: Heavy. CSS Modules + custom components give more control.
│   - Zustand/Jotai: Developer knows Redux. RTK Query covers server state.

- Backend:
├── Runtime: Node.js 22 LTS — Developer specified. Stable, good Render support.
├── Framework: Express.js — Mature ecosystem, handles SSE natively, developer familiarity.
├── ORM: Prisma — Type-safe, generates TS types from schema, excellent migration tooling,
│   works with Neon Postgres. Shared types via monorepo.
├── Validation: Zod — Schemas shared between frontend and backend via shared package.
├── File Processing:
│   ├── PDF: pdfjs-dist (legacy build) — see §12 for why pdf-parse was replaced
│   ├── DOCX: mammoth
│   ├── TXT: Native fs
│   └── URL: Mozilla Readability + jsdom
├── Email: Resend — Simple API, generous free tier (100 emails/day).
├── Logging: pino — Structured JSON logging, lightweight.
├── Rejected alternatives:
│   - NestJS: Heavyweight for solo-dev MVP.
│   - Drizzle: Less mature migration tooling than Prisma.
│   - Nodemailer + SMTP: Unreliable self-managed email.
│   - Passport.js: Abstraction over 10 lines of bcrypt + JWT.

- Database:
├── Primary: PostgreSQL on Neon — Serverless Postgres, free tier, connection pooling built-in.
├── Local Dev: Docker Postgres 17 — Zero network latency, works offline.
├── Cache: None for MVP — 30 users don't need Redis.
├── Rejected alternatives:
│   - MongoDB: Relational data. Document DB adds complexity for no benefit.
│   - SQLite: Can't share between instances if scaling.

- Infrastructure:
├── Hosting: Render
│   ├── Backend: Web Service ($7/mo starter — avoids cold starts)
│   └── Frontend: Static Site (free tier)
├── CI/CD: GitHub Actions (lint, typecheck, test, build) + Render auto-deploy
├── Secrets: Render Environment Variables
├── Monorepo: npm workspaces — Three packages: client, server, shared

- Testing:
| Layer | Type | Tool | Est. Count |
|---|---|---|---|
| Shared schemas | Unit | Vitest | ~20 |
| Server utils | Unit | Vitest | ~15 |
| Server services | Unit (mocked deps) | Vitest | ~30 |
| Server prompts | Unit | Vitest | ~10 |
| Server API | Integration (real Postgres) | Vitest + Supertest | ~25 |
| Client components | Component | Vitest + React Testing Library | ~15 |
| Critical paths | E2E | Playwright | 5 |

## Code Conventions

Follow `.claude/rules/coding-conventions.md` for all code written in this project. These rules are non-negotiable. Never deviate without explicit user approval.

## Architectural Boundaries

Universal rules (apply regardless of architecture):
- No circular dependencies between modules.
- No business logic in route handlers — routes are thin wrappers that call services.
- No direct database calls outside the designated data access layer.
- Shared types, constants, and validation schemas live in one place — never duplicated across packages.
- No hardcoded values — extract to constants or environment variables.

Project-specific boundaries:

**Routes:** Parse request → call service → return response. NO business logic, NO direct Prisma calls, NO try/catch (wrap in `asyncHandler()`), NO error response formatting.

**Services:** NO `req`/`res` imports, NO HTTP response formatting. Call `assertOwnership()` for every protected resource. Only layer that throws `AppError` subclasses. May call Prisma directly; extract reused query patterns into private helpers.

**Shared package:** NO imports from `packages/server` or `packages/client`. Zod schemas are the single source of truth — derive all types via `z.infer<>`. Never duplicate a schema.

**Frontend components:** NO direct API calls (`fetch`, `axios`). All server communication through RTK Query hooks. NO business logic — render UI and call hooks.

**Middleware:** `error.middleware.ts` is the only place that formats error responses. `validate.middleware.ts` is the only place that runs Zod parsing. `auth.middleware.ts` is the only place that verifies JWT tokens.

**General:** All env-specific values come from `src/config/env.ts` (Zod-validated on startup). Database columns use `snake_case` via `@map()`; Prisma fields and application code use `camelCase`.

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (React SPA)                       │
│                  Render Static Site (Free)                    │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   Auth   │ │ Sessions │ │   Quiz   │ │  Dashboard   │   │
│  │  Pages   │ │  Pages   │ │  Pages   │ │    Page      │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       └─────────────┴────────────┴──────────────┘            │
│                         │                                    │
│                    RTK Query                                 │
│                 (API Client Layer)                            │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTPS (REST + SSE for streaming)
                          │
┌─────────────────────────┼────────────────────────────────────┐
│                   SERVER (Express.js)                         │
│                Render Web Service ($7/mo)                     │
│                         │                                    │
│  ┌──────────────────────┴──────────────────────────┐        │
│  │             MIDDLEWARE CHAIN                      │        │
│  │  cors → helmet → rateLimit → auth → validate     │        │
│  └──────────────────────┬──────────────────────────┘        │
│                         │                                    │
│  ┌──────────┐ ┌────────┴───┐ ┌──────────┐ ┌──────────┐    │
│  │  Auth    │ │  Session   │ │   Quiz   │ │ Material │    │
│  │ Routes   │ │  Routes    │ │  Routes  │ │  Routes  │    │
│  └────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘    │
│       │             │              │             │           │
│  ┌────┴─────┐ ┌─────┴──────┐ ┌────┴─────┐ ┌────┴─────┐    │
│  │  Auth    │ │  Session   │ │   Quiz   │ │ Material │    │
│  │ Service  │ │  Service   │ │  Service │ │  Service │    │
│  └────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘    │
│       │             │         ┌────┴─────┐      │           │
│       │             │         │   LLM    │      │           │
│       │             │         │ Service  │      │           │
│       │             │         └──────────┘      │           │
│  ┌────┴─────────────┴──────────────────────┬────┴─────┐    │
│  │                Prisma ORM               │ S3 Svc   │    │
│  └─────────────────┬──────────────────────┘└────┬─────┘    │
└────────────────────┼────────────────────────────┼──────────┘
                     │                            │
        ┌────────────┼──────────────┐             │
        │            │              │             │
 ┌──────┴──────┐ ┌───┴────┐ ┌──────┴──────┐ ┌───┴────┐
 │    Neon     │ │  AWS   │ │   Resend    │ │Anthropic│
 │  Postgres   │ │   S3   │ │  (Email)    │ │  (LLM) │
 └─────────────┘ └────────┘ └─────────────┘ └────────┘
```

## Spec-Driven Workflow

**ABSOLUTE RULE: Never make autonomous decisions. If implementation requires deviating from the spec in any way — different approach, additional dependency, changed data model, skipped requirement — STOP immediately. Explain the deviation to the user: what the spec says, what you think needs to change, and why. Wait for explicit user confirmation before proceeding. This applies to every decision, no matter how small.**

Before implementing any feature:
1. Read `specs/features/{feature-name}/SPEC.md` (or `RFC.md` for refactors). This is your implementation brief.
2. If a `REVIEW.md` exists in the same folder, read its Lessons Learned section. Apply those rules during implementation.
3. Implement ONLY what the spec defines. Nothing more, nothing less. No gold-plating.

During implementation:
- Every acceptance criterion in the spec must be satisfied. Check them off as you implement.
- Test expectations come from acceptance criteria — never derive tests from reading your own implementation.
- If you discover the spec is incomplete or ambiguous, STOP and ask. Do not fill gaps with assumptions.

After implementation:
- Verify every acceptance criterion is covered by at least one test.
- Verify every error status code in the API contracts has a corresponding test.

## Git Workflow

- Branch naming: `feature/QZ32-description` or `fix/QZ32-description`
- Commit messages: `type: description` (types: feat, fix, docs, refactor, test, chore)
- Pre-push: run lint, typecheck, and tests locally before pushing. Do not push failing code.
- PRs: one feature branch per spec. PR description references the spec file path.

## Reference Documents

- Product requirements: `specs/PRD.md`
- Technical design: `specs/TDD.md`
- Feature specs: `specs/features/{name}/SPEC.md`
- Implementation rules: `.claude/rules/implementation-mode.md`
- Coding standards: `.claude/rules/coding-conventions.md`
