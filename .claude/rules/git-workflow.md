# Git Workflow Rules

- Branch naming: `feature/001-monorepo-setup`, `feature/007-auth-backend`, `fix/012-token-expiry`. Zero-padded task number from TDD + kebab-case description.
- One task = one branch = one PR. Never combine multiple tasks in a single PR.
- Vertical slices: each PR includes the full stack for that feature — Zod schema in shared, service + route in server, RTK Query endpoint + page/component in client, tests. Never a PR that adds only a schema without the code that consumes it.
- Conventional commits: `feat(auth): add signup endpoint`, `fix(quiz): handle empty materials`, `chore(ci): add integration test job`, `refactor(services): extract ownership helper`. Scope matches the package or feature area.
- Commit messages: imperative mood, lowercase after prefix, no period. Max 72 chars for subject line. Body optional — use for "why", not "what".
- CI must pass before merge: lint (ESLint) → typecheck (`tsc --noEmit`) → unit tests → integration tests → build. All green = merge eligible.
- GitHub Copilot agent reviews every PR. Address review comments before merging — don't dismiss without justification.
- Merge strategy: squash merge to main. Keeps main history clean — one commit per task/feature.
- Never push directly to main. All changes go through PR, even one-line fixes.
- After merge to main: Render auto-deploys backend + frontend. Delete the feature branch.
