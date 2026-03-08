---
description: Code style, naming, structure, and conventions for all source and test code
globs: "**/*.{ts,tsx,js,jsx}"
---

# Coding Conventions

These rules apply to every file written or modified in this project. Never deviate without explicit user approval.

## Naming

- Functions: verb-noun camelCase. Examples: `getUserById`, `signToken`, `setAuthCookie`, `pickSafeUser`, `validateInput`, `createQuizAttempt`.
- Variables: descriptive camelCase. Use `userData` not `data`, `passwordHash` not `hash`, `currentUser` not `u`. The name must tell the reader what the variable holds without looking at the assignment.
- Constants: UPPER_SNAKE_CASE. Examples: `COOKIE_NAME`, `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`.
- Booleans: prefix with `is`, `has`, `can`, `should`. Examples: `isAuthenticated`, `hasPermission`, `canEdit`.
- Files: dot-case with kebab-case segments. Format: `name.role.ts`. Examples: `auth.service.ts`, `quiz.routes.ts`, `auth.middleware.ts`, `validate-input.utils.ts`.
- Types/Interfaces: PascalCase, noun-based. Examples: `User`, `QuizAttempt`, `CreateUserInput`, `ApiResponse`.
- Never use single-letter variables except in algorithm-specific code (e.g., `left`, `right` pointers in two-pointer pattern, `i` in simple loops). Application code must always use descriptive names.

## Functions

- Every function does one thing. If you need a comment saying "this part does X, this part does Y" — split it.
- Pure logic functions: 10 lines max. If longer, extract a helper.
- Orchestration functions (route handlers, controllers, service methods that coordinate multiple steps): 30 lines max. If longer, extract steps into named helper functions.
- Always use explicit return types in TypeScript. Never rely on inference for exported functions.
- Prefer early returns for validation and guard clauses:

```typescript
// CORRECT — early return
function getUserById(id: string): User | null {
  if (!id) return null;
  const user = db.findUser(id);
  if (!user) return null;
  return user;
}

// WRONG — nested conditionals
function getUserById(id: string): User | null {
  if (id) {
    const user = db.findUser(id);
    if (user) {
      return user;
    } else {
      return null;
    }
  } else {
    return null;
  }
}
```

## File Structure

Every file follows this order. No exceptions:
1. Imports (grouped: external packages first, then internal modules, then types)
2. Constants
3. Types/Interfaces (if co-located, not in a separate types file)
4. Helper functions (small, private utilities used only in this file)
5. Main exports (the primary function, class, or component this file exists for)

## Types and Interfaces

- Prefer `interface` for object shapes that describe data structures (entities, API payloads, props).
- Use `type` for unions, intersections, mapped types, and utility types.
- Shared types used across multiple files live in the designated shared types location (defined in TDD).
- Never duplicate a type that exists in the shared location. Import it.
- Always define input and output types for service functions and API handlers:

```typescript
// CORRECT — explicit input/output types
interface CreateUserInput {
  email: string;
  username: string;
  password: string;
}

interface SafeUser {
  id: string;
  email: string;
  username: string;
}

function createUser(input: CreateUserInput): Promise<SafeUser> { ... }

// WRONG — inline shapes, no reusability
function createUser(input: { email: string; username: string; password: string }): Promise<{ id: string; email: string; username: string }> { ... }
```

## Error Handling

- Input validation: use early returns for pure functions. In this project, validation failures in services throw an `AppError` subclass — the global `error.middleware.ts` handles response formatting. Project-specific architectural boundaries (see CLAUDE.md) override these general examples.

```typescript
// CORRECT — throw AppError for validation in services (project pattern)
if (!email || !password) {
  throw new ValidationError("email and password are required");
}

// CORRECT — early return for validation in pure/utility functions
if (!id) return null;
```

- Operations that can fail (database, external APIs, file I/O): use try/catch.

```typescript
// CORRECT — try/catch for operations
try {
  const result = await db.query(sql, params);
  return result.rows[0];
} catch (error) {
  // handle or rethrow — never swallow silently
}
```

- Never catch an error and swallow it silently. Every catch block must: rethrow, log with context, or return an explicit error response.
- Error messages must be actionable — tell the user what to do, not just what went wrong. Example: `"email and password are required"` not `"Bad request"`.
- Never expose internal error details to the client. 4xx errors: include actionable message. 5xx errors: generic message to client, full details to logs.

## Constants and Magic Values

- No hardcoded strings or numbers in logic. Extract to a named constant.
- Constants used in one file: define at the top of that file.
- Constants used across files: define in the shared constants location (defined in TDD).

```typescript
// CORRECT
const COOKIE_NAME = "token";
const TOKEN_EXPIRY = "7d";
const MAX_LOGIN_ATTEMPTS = 5;

// WRONG
res.cookie("token", token, { maxAge: 604800000 });
```

## Comments

- No comments that restate what the code does. The code must be readable without them.
- Comment only: non-obvious business logic, workarounds with context, and "why" decisions.
- Keep comments to one line when possible. If a comment needs a paragraph, the code is too complex — simplify first.

```typescript
// CORRECT — explains WHY, not WHAT
// PostgreSQL error code 23505 = unique constraint violation
if (err.code === "23505") { ... }

// WRONG — restates the code
// Check if the user exists
if (!user) { ... }
```

## Reusability

- If the same logic appears in two or more places, extract it into a shared helper function.
- Helper functions that serve one file: keep in that file, above the main export.
- Helper functions that serve multiple files: move to the designated utils/helpers location (defined in TDD).
- Prefer composing small functions over writing one large function. Each function is a reusable building block.

```typescript
// CORRECT — reusable helper
function pickSafeUser(row: UserRow): SafeUser {
  return { id: row.id, email: row.email, username: row.username };
}

// Used in register, login, me, profile — one definition, four usages.
```

## Performance Awareness

- When writing loops or data transformations, consider time and space complexity.
- Prefer Map/Set over arrays for lookup operations (O(1) vs O(n)).
- Never nest loops over the same dataset without justification. If you find yourself writing O(n²), stop and consider if a Map, Set, or sorting can reduce it to O(n) or O(n log n).
- If a function processes a collection, document the expected complexity in a brief comment when it's not obvious:

```typescript
// O(n) — single pass with Map lookup
function findDuplicates(items: string[]): string[] { ... }
```

## Test File Structure

- Unit and integration tests: co-located with source code. Place `filename.test.ts` next to `filename.ts` in the same folder.
- **Migration note**: The existing codebase uses `__tests__/` subdirectories (e.g., `services/__tests__/auth.service.test.ts`). Do not move existing tests — leave them in `__tests__/` until explicitly migrated. All **new** test files follow the co-located convention (`filename.test.ts` next to `filename.ts`).
- E2E tests: live in `e2e/` folder at project root, organized by user journey.
- Test file naming: `{source-filename}.test.ts`. Example: `auth.service.ts` → `auth.service.test.ts`.

## Testing Conventions

All coding conventions above apply to test code. Tests are code — they must be readable, descriptive, and maintainable. These additional rules apply:

- Test names must describe the behavior in plain English. Format: `it("returns 401 when token is expired")` not `it("should work")` or `it("test case 1")`.
- Group related tests with `describe` blocks named after the function or feature being tested. Maximum one level of nesting — never nest `describe` inside `describe` inside `describe`.

```typescript
// CORRECT — flat, readable
describe("signToken", () => {
  it("returns a valid JWT with user id as subject", () => { ... });
  it("sets expiry to 7 days", () => { ... });
});

describe("requireAuth middleware", () => {
  it("returns 401 when no token cookie is present", () => { ... });
  it("returns 401 when token is expired", () => { ... });
  it("attaches user payload to req.user when token is valid", () => { ... });
});

// WRONG — deeply nested, hard to read
describe("auth", () => {
  describe("middleware", () => {
    describe("requireAuth", () => {
      describe("when token is missing", () => {
        it("should return 401", () => { ... });
      });
    });
  });
});
```

- Each test tests one behavior. If a test has multiple assertions that verify different things, split it into separate tests.
- Test variables must be as descriptive as application code. Use `expiredToken`, `validUserInput`, `mockQuizResponse` — not `t`, `input`, `res`.
- Setup/teardown code must be readable without framework knowledge. Prefer explicit setup inside the test over `beforeEach` when the setup is short (under 5 lines). Use `beforeEach` only when the same setup is needed by every test in the `describe` block.
- Never test implementation details. Test behavior: "when I call X with Y, I get Z" — not "function X calls internal method Y exactly once."
- Mock names must describe what they replace: `mockAuthenticatedUser`, `mockFailedDatabaseQuery` — not `mock1`, `mockFn`.
