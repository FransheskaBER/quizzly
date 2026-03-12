# Review: error-handling-audit (backend)
**Date**: 2026-03-12
**Spec file**: `backend-audit-spec.md`
**Overall result**: Deviations found

## Deviations

### 1) LLM logger context missing `operation`
- **Section**: Backend findings `BE-001`, `BE-006`
- **Type**: Code is wrong
- **Spec says**: logger context should include operation-level metadata in these catches.
- **Code does**: `logger.error({...operation...})` and `Sentry.captureException(...extra.operation...)` are now both present in `llm.service.ts`.
- **Root cause**: telemetry contract was implemented partially (Sentry complete, structured logger incomplete).
- **Resolution**: implemented in `packages/server/src/services/llm.service.ts` (`callLlmStream`, `parseBlock`).

### 2) Final verdict narrative is stale
- **Section**: `## Final Audit Verdict`
- **Type**: Spec is outdated
- **Spec says**: describes high-risk backend gaps as currently unresolved.
- **Code does**: stale verdict/status sections were removed from the spec; status now lives in this review.
- **Root cause**: audit snapshot text remained static after implementation progressed.
- **Resolution**: implemented by removing stale status/verdict snapshot content from the spec.

### 3) Coverage/remediation snapshot is stale
- **Section**: `Backend Coverage Summary`, remediation bullets, checklist
- **Type**: Spec is outdated
- **Spec says**: unresolved counts and to-do actions.
- **Code does**: snapshot counters/checklists were removed from the spec to avoid drift.
- **Root cause**: point-in-time metrics stayed in spec instead of review artifact.
- **Resolution**: implemented by keeping status/progress tracking in `REVIEW.md`.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|---|---|---|---|
| BE-001: No silent catch in `llm.service.ts` parse path; telemetry includes operation context | Yes | No (no assertion for logger operation field) | Gap |
| BE-002: `health.service.ts` catch logs + Sentry before degraded response | Yes | Yes (`services/__tests__/health.service.test.ts`) | Pass |
| BE-003: `s3.service.ts` catches capture to Sentry with context | Yes | Yes (`services/__tests__/s3.service.test.ts`) | Pass |
| BE-004: `material.service.ts` catches capture to Sentry with full context | Yes | No (not all catch branches asserted) | Gap |
| BE-005: BYOK decrypt catches in `quiz.service.ts` capture to Sentry | Yes | Yes (`services/__tests__/quiz.service.test.ts`) | Pass |
| BE-006: LLM stream/provider failures log + Sentry with operation context | Yes | No (logger context shape not asserted) | Gap |
| BE-007: `auth.middleware.ts` catch logs + Sentry with request context | Yes | Yes (`middleware/__tests__/auth.middleware.test.ts`) | Pass |
| BE-008: `validate.middleware.ts` catch logs + Sentry with schema target context | Yes | Yes (`middleware/__tests__/validate.middleware.test.ts`) | Pass |
| BE-009: `error.middleware.ts` includes telemetry for mapped error paths | Yes | Yes (`middleware/__tests__/error.middleware.test.ts`) | Pass |
| BE-010: material fallback update failure preserves/captures causal context | Yes | No (no dedicated regression test) | Gap |
| BE-011: duplicate capture removed from auth/email path | Yes | No (no dedicated non-duplication assertion) | Gap |
| BE-012: process-level `uncaughtException`/`unhandledRejection` handlers with Sentry + shutdown | Yes | Yes (`utils/__tests__/process-shutdown.utils.test.ts`) | Pass |

## Lessons Learned

- Keep specs normative; keep point-in-time status in review artifacts.
- Telemetry contracts must be symmetric across sinks (`logger` and `Sentry`), not split.
- Add explicit regression tests for telemetry field shape (`operation`, IDs), not just “Sentry called”.
- Include an acceptance-criterion-to-test mapping while implementing, not after.

## TDD Updates Required

- No TDD updates required.

---

# Review: error-handling-audit (frontend)
**Date**: 2026-03-12
**Spec file**: `frontend-audit-spec.md`
**Overall result**: Deviations found

## Deviations

### 1) Frontend findings list is stale
- **Section**: `## Frontend Spec Audit` (`FE-001` to `FE-014`)
- **Type**: Spec is outdated
- **Spec says**: frontend still has open P0/P1/P2 telemetry defects and unresolved required fixes.
- **Code does**: all listed findings are implemented, with targeted tests per finding family.
- **Root cause**: the audit section captured an earlier pre-fix snapshot and was not updated after remediation.
- **Resolution**: update `frontend-audit-spec.md` to reflect resolved status and current coverage evidence.

### 2) Frontend coverage summary and gate status are stale
- **Section**: `Frontend Coverage Summary`, `Frontend Gate Decision`
- **Type**: Spec is outdated
- **Spec says**: `23` catches reviewed, `2` compliant, `21` non-compliant, gate `FAIL`.
- **Code does**: telemetry instrumentation is now present across the audited flows; focused frontend telemetry tests pass.
- **Root cause**: point-in-time counters remained in the spec and drifted from implementation.
- **Resolution**: replace stale counters/fail gate with current passing status and keep progress snapshots in review artifacts.

### 3) Final frontend verdict is stale
- **Section**: `## Final Audit Verdict`
- **Type**: Spec is outdated
- **Spec says**: overall frontend verdict remains `FAIL` with unresolved remediation checklist.
- **Code does**: frontend telemetry findings are resolved and validated by passing focused tests.
- **Root cause**: verdict text was not refreshed after fixes landed.
- **Resolution**: update final verdict and remove stale open-checklist language from the spec file.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|---|---|---|---|
| FE-001: local storage parse catch emits console + Sentry telemetry | Yes | Yes (`pages/sessions/SessionDashboardPage.test.tsx`) | Pass |
| FE-002: SSE malformed payload catch emits telemetry with stream metadata | Yes | Yes (`hooks/useSSEStream.test.ts`) | Pass |
| FE-003: optimistic rollback catch emits telemetry before rollback | Yes | Yes (`api/quizzes.api.test.ts`) | Pass |
| FE-004: SSE transport failure emits console + Sentry telemetry | Yes | Yes (`hooks/useSSEStream.test.ts`) | Pass |
| FE-005: Session Dashboard retry/update/delete catches emit telemetry | Yes | Yes (`pages/sessions/SessionDashboardPage.test.tsx`) | Pass |
| FE-006: Profile catches emit telemetry (username/password/save/delete key) | Yes | Yes (`pages/profile/ProfilePage.test.tsx`) | Pass |
| FE-007: Create Session catch emits telemetry | Yes | Yes (`pages/sessions/CreateSessionPage.test.tsx`) | Pass |
| FE-008: Verify Email catch emits token-safe telemetry | Yes | Yes (`pages/auth/VerifyEmailPage.test.tsx`) | Pass |
| FE-009: Auth pages catches emit telemetry (signup/login/forgot/reset) | Yes | Yes (`pages/auth/AuthTelemetryPages.test.tsx`) | Pass |
| FE-010: Material uploader catches emit telemetry (file/url flows) | Yes | Yes (`components/session/MaterialUploader.test.tsx`) | Pass |
| FE-011: Quiz autosave/submit catches emit telemetry with stage context | Yes | Yes (`pages/quiz/QuizTakingPage.test.tsx`) | Pass |
| FE-012: ErrorBoundary logs to console and captures to Sentry | Yes | Yes (`components/common/ErrorBoundary.test.tsx`) | Pass |
| FE-013: getMe hydration 401 path has sampled/rate-limited telemetry context | Yes | Yes (`api/auth.api.test.ts`) | Pass |
| FE-014: global 401 auto-logout emits centralized telemetry with endpoint/method | Yes | Yes (`store/api.test.ts`) | Pass |

## Lessons Learned

- Keep audit spec files normative and current; move temporal progress snapshots to review artifacts.
- For telemetry-focused audits, each finding should map to an explicit regression test to prevent drift.
- Add operation-level metadata requirements directly in acceptance criteria to avoid partial instrumentation.

## TDD Updates Required

- No TDD updates required.
