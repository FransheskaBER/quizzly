---
description: Rules active during feature implementation from specs — enforces spec-anchored workflow
globs: "**/*.{ts,tsx,js,jsx}"
---

# Implementation Mode

These rules are active when implementing features from a spec (SPEC.md or RFC.md). They enforce the spec-anchored development workflow. Every rule is non-negotiable.

## Rule 1: No Autonomous Decisions

Never make a decision the user hasn't explicitly approved. This is the highest-priority rule — it overrides all other considerations including speed and convenience.

If you encounter any of the following, STOP immediately and ask the user:
- The spec doesn't address something you need to decide (gap).
- You think a different approach would work better than what the spec says.
- A dependency, library, or API behaves differently than the spec assumed.
- You need to add something not mentioned in the spec (a utility function, a type, a config change).
- The acceptance criteria seem incomplete or ambiguous.
- You discover an edge case the spec doesn't cover.

When you stop, explain:
1. What the spec says (or doesn't say).
2. What you think needs to happen and why.
3. Options if there are multiple approaches.

Wait for the user's decision. Then proceed with exactly what was agreed.

**Never assume. Never default. Never "just handle it." Always ask.**

## Rule 2: Spec Is the Source of Truth

Before writing any code, read the feature spec:
- `specs/features/{feature-name}/SPEC.md` for new features.
- `specs/features/{change-name}/RFC.md` for refactors, removals, and migrations.

Implement ONLY what the spec defines:
- Every item in scope (Section 2) must be implemented.
- Every item out of scope (Section 2) must NOT be implemented.
- Every design decision (Section 3) must be followed exactly as documented.
- Every data model change (Section 4) must match the spec — no extra columns, no missing indexes, no renamed tables.
- Every API contract (Section 5) must match — exact endpoints, exact request/response shapes, exact status codes.
- Every acceptance criterion (Section 6) must be satisfiable by the implementation.

If you cannot implement something exactly as specified, go back to Rule 1: STOP and ask.

## Rule 3: Test From Acceptance Criteria

Test expectations come from the spec's acceptance criteria (Section 6), never from reading the implementation.

Process:
1. Read all acceptance criteria from the spec.
2. For each criterion, write the test BEFORE or ALONGSIDE the implementation — never after.
3. Each test name must reference the behavior from the acceptance criterion, not the implementation detail.
4. Every error status code in the API contracts (Section 5) must have a corresponding test.
5. Every failure path in the acceptance criteria must have a corresponding test.

Never write a test that verifies your own implementation works. Write tests that verify the spec's requirements are met. If you realize a test is just confirming what you wrote rather than what the spec requires, delete it and rewrite from the acceptance criterion.

## Rule 4: Follow All Convention Rules

Read and follow `.claude/rules/coding-conventions.md` for all code and test files. Key rules to never violate:
- Naming: verb-noun functions, descriptive variables, UPPER_SNAKE constants.
- Function length: 10 lines for pure logic, 30 lines for orchestration.
- Early returns for validation, try/catch for operations.
- Test names describe behavior in plain English.
- Co-located tests next to source files.

If a new `.claude/rules/` file is added to the project, follow it. Rules files are cumulative — all active rules apply simultaneously.

## Rule 5: Check REVIEW.md Before Starting

Before starting implementation, check if `specs/features/{feature-name}/REVIEW.md` exists from a prior review cycle.

If it exists:
1. Read the Lessons Learned section.
2. Apply every lesson as a constraint during this implementation.
3. If a lesson contradicts the spec, STOP and ask the user which takes priority.

If it does not exist, proceed normally.

## Rule 6: Spec Updates Require User Approval

If during implementation you discover that the spec needs to change (a gap, a mistake, an impractical requirement):

1. STOP implementation.
2. Explain to the user what you found and why the spec needs updating.
3. Wait for the user to decide how to proceed.
4. If the user approves a spec change: the user will update the spec. Do not modify spec files during implementation.
5. Resume implementation only after the spec is updated and the user confirms.

Never silently deviate from the spec. Never update the spec yourself. Never continue building something different from what the spec says.

## Rule 7: No Gold-Plating

Do not add features, utilities, abstractions, or "nice-to-haves" that are not in the spec. Specifically:
- No extra API endpoints beyond what Section 5 specifies.
- No additional database columns or tables beyond what Section 4 specifies.
- No utility functions "for future use" that no current code calls.
- No abstraction layers (repositories, factories, adapters) unless the spec explicitly calls for them.
- No error handling for scenarios the spec doesn't identify as failure paths.

If you think something is missing from the spec, go back to Rule 1: STOP and ask.

## Rule 8: Failure-Path Side Effects

When an acceptance criterion specifies side effects on the error path (e.g., "returns 401, clears both cookies"), implement explicit error handling in the route handler. Do not rely on error middleware or `asyncHandler` for resource cleanup — they only handle response formatting.

Specifically:
- If the spec says "on failure, clear cookies" — add a try/catch that clears cookies before re-throwing.
- If the spec says "on failure, delete DB record" — add explicit cleanup logic in the handler.
- If the spec says "on failure, invalidate cache" — handle it at the route level, not in middleware.

Error middleware owns response formatting. Route handlers own resource cleanup on failure. These are separate responsibilities.

When writing tests for failure-path side effects, assert the side effect explicitly — not just the status code. A test named "returns 401 and clears cookies" must verify both the 401 AND the cookie-clearing headers.
