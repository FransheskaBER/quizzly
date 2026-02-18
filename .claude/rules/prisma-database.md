# Prisma & Database Rules

## Column Conventions — Every Table
- PK: `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. Never autoincrement. Never expose sequential IDs.
- Timestamps: `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()` and `updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()` on every table. Exception: `questions` table is immutable — `created_at` only, no `updated_at`.
- Column naming: `snake_case` in Postgres via `@map()`, `camelCase` in Prisma model. Always add `@@map("table_name")` on every model.
- All foreign keys: `@db.Uuid` with explicit `onDelete: Cascade`. Every FK column must have an `@@index`.

## Type Rules
- Scores: `Decimal @db.Decimal(5, 2)` for `quiz_attempts.score` (0.00–100.00). `Decimal @db.Decimal(3, 2)` for `answers.score` (only valid values: 0.00, 0.50, 1.00). Never use `Float` for any numeric precision.
- Booleans: explicit `@default(false)` or `@default(true)`. Never leave a boolean without a default.
- Free text: `@db.Text` for unbounded content (goal, question_text, extracted_text). `@db.VarChar(N)` for bounded fields (email 255, name 200, subject 200, status 20).
- JSONB: `Json?` type for flexible structures (options, tags, prompt_config). Validate shape in application layer via Zod, not DB constraints.
- Status fields: `String @db.VarChar(20)` with application-level enum validation. Not Postgres enums — avoids migration pain when adding values.

## Deletion & Data Integrity
- No soft deletes anywhere. Hard delete with `ON DELETE CASCADE` on all foreign keys.
- Session delete cascades to: materials, quiz_attempts, questions, answers. Also triggers S3 object cleanup in service layer.
- `password_resets`: hard delete expired/used tokens on each new reset request for same user.

## Migration Workflow
- Naming: `npx prisma migrate dev --name 001_create_users`, `002_create_sessions`, etc. Prefix with zero-padded number.
- Before every production migration: create a Neon branch first, run migration against branch, verify clean, then run against production.
- Backward-compatible only: add columns with `DEFAULT` or as nullable. Never rename columns — add new, migrate data, drop old. Never drop columns without first deploying code that stops using them.
- Access Prisma via validated config: `import { prisma } from '@server/config/prisma'`. Never instantiate `new PrismaClient()` in service files.
