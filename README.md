# Quizzly

Quiz app that generates critical evaluation and architectural thinking exercises from your study materials.

---

## Tech Stack

- **Frontend:** React 18, Vite, Redux Toolkit, RTK Query, React Router DOM v6, CSS Modules, React Hook Form, Zod
- **Backend:** Node.js 22, Express, Prisma, Zod, pino
- **Database:** PostgreSQL 17 (Docker local, Neon production)
- **Storage:** AWS S3 (presigned URLs), extracted text in Postgres
- **LLM:** Anthropic Claude Sonnet 4, streaming via SSE
- **Auth:** JWT (jsonwebtoken, 7-day expiry), bcryptjs (cost 12)
- **Email:** Resend
- **Hosting:** Render (backend + static frontend)

---

## Prerequisites

- Node.js 22
- Docker
- Accounts/API keys: Anthropic, AWS S3, Resend (see [Environment Variables](#8-environment-variables))

---

## Getting Started

```bash
git clone https://github.com/your-username/quizzly.git
cd quizzly
npm install
```

```bash
# Start local Postgres
docker-compose up -d

# Copy and fill environment variables
cp .env.example packages/server/.env
# Edit packages/server/.env with your values

# Run migrations
cd packages/server && npx prisma migrate dev

# Seed (optional)
npx prisma db seed

cd ../..

# Start dev servers
npm run dev
```

Open http://localhost:5173. The API is at http://localhost:3000/api. You should see the landing page; sign up to create an account.

---

## Project Structure

- **packages/shared** — Zod schemas, inferred types, enums, constants. Imported by server and client.
- **packages/server** — Express API, Prisma ORM, services, prompts.
- **packages/client** — React SPA, RTK Query, pages, components.

---

## Available Scripts

**Root:**
- `npm run dev` — Start server and client in watch mode
- `npm run build` — Build all packages
- `npm run build:production` — Build shared, then server, then client
- `npm run test` — Run tests in all packages
- `npm run lint` — ESLint
- `npm run format` — Prettier write
- `npm run format:check` — Prettier check
- `npm run typecheck` — TypeScript in all packages
- `npm run dev:e2e` — Start server (NODE_ENV=test) and client for E2E

**packages/server:**
- `npm run dev -w packages/server` — Dev with tsx watch
- `npm run build -w packages/server` — tsc build
- `npm run start -w packages/server` — Run built server
- `npm run test -w packages/server` — Vitest
- `npm run eval:generation -w packages/server` — Prompt evaluation (generation)
- `npm run eval:grading -w packages/server` — Prompt evaluation (grading)
- `npm run eval:scorecard -w packages/server` — Print evaluation scorecard

**packages/client:**
- `npm run dev -w packages/client` — Vite dev server
- `npm run build -w packages/client` — Vite build
- `npm run test -w packages/client` — Vitest
- `npm run e2e -w packages/client` — Playwright E2E

---

## Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `NODE_ENV` | development, production, or test | Yes | `development` |
| `PORT` | Server port | Yes | `3000` |
| `CLIENT_URL` | Frontend origin for CORS | Yes | `http://localhost:5173` |
| `DATABASE_URL` | Postgres connection string | Yes | `postgresql://skills_dev:skills_dev@localhost:5432/skills_trainer` |
| `JWT_SECRET` | Minimum 32 characters | Yes | `your-secret-here-change-in-production-minimum-32-characters` |
| `JWT_EXPIRES_IN` | Token expiry | No | `7d` |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Yes (for uploads) | — |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | Yes (for uploads) | — |
| `AWS_REGION` | S3 region | Yes (for uploads) | `eu-north-1` |
| `S3_BUCKET_NAME` | S3 bucket name | Yes (for uploads) | — |
| `ANTHROPIC_API_KEY` | Claude API key | Yes | — |
| `RESEND_API_KEY` | Resend API key | Yes | — |
| `EMAIL_FROM` | Sender email | Yes | `noreply@yourdomain.com` |
| `SENTRY_DSN` | Sentry DSN (optional) | No | — |
| `VITE_API_URL` | Backend URL for client | No | `http://localhost:3000` |
| `VITE_SENTRY_DSN` | Sentry DSN for client | No | — |

---

## Testing

**Unit tests:** `npm test` — runs Vitest in shared, server, client.

**Integration tests:** Require Docker Postgres. Set `DATABASE_URL` to the test database. Run from repo root: `npm test`. CI uses `postgresql://skills_test:skills_test@localhost:5432/skills_trainer_test`.

**E2E tests:** Require both dev servers running. Use `npm run dev:e2e` to start them, then from `packages/client`: `npx playwright test`. Requires `ANTHROPIC_API_KEY` in `packages/server/.env`.

---

## Deployment

Production uses Render (backend Web Service and static frontend), Neon Postgres, AWS S3, and Resend. Push to `main` triggers deployment. Backend runs `npx prisma migrate deploy` and `tsc`; frontend runs `vite build`. Health check: `/api/health`.
