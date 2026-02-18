# TypeScript Rules

- Strict mode enabled (`"strict": true` in all tsconfig files). No exceptions.
- `any` is banned. Use `unknown` + type narrowing, or define a proper type/interface. Zero tolerance.
- 2-space indentation everywhere. No tabs.
- Runtime validation: Zod schemas in `packages/shared/src/schemas/`. Infer types with `z.infer<typeof schema>` — never hand-write a type that duplicates a schema.
- Import order (enforced by ESLint): (1) node builtins, (2) external packages, (3) `@shared/` imports, (4) relative imports. Blank line between groups.
- Path aliases: `@shared/*` → `packages/shared/src/*`, `@server/*` → `packages/server/src/*`, `@client/*` → `packages/client/src/*`. Never use `../../../shared`.
- Naming: `PascalCase` for types, interfaces, enums, React components. `camelCase` for variables, functions, methods. `UPPER_SNAKE_CASE` for constants. `kebab-case` for file names except React components (`QuestionCard.tsx`).
- Interfaces for object shapes (`interface User {}`). Type aliases for unions, intersections, utility types (`type QuizStatus = 'generating' | 'in_progress' | ...`).
- Prefer `const` over `let`. Never use `var`.
- Explicit return types on exported functions and all service methods. Inferred return types acceptable on internal/private helpers.
- Enums: use string enums (`enum DifficultyLevel { Easy = 'easy' }`) or const objects with `as const`. Never numeric enums.
- No default exports except React page components (required by `React.lazy()`). Use named exports everywhere else.
- Non-null assertions (`!`) banned. Handle nullability explicitly with optional chaining, nullish coalescing, or type guards.
- Express `req.user` typed via `express.d.ts` augmentation — never cast to `any`.
- Prisma types: import generated types from `@prisma/client`. Don't redeclare model shapes manually.
