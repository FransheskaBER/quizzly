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
| BE-012: process-level `uncaughtException`/`unhandledRejection` handlers with Sentry + shutdown | Yes | No (no dedicated test) | Gap |

## Lessons Learned

- Keep specs normative; keep point-in-time status in review artifacts.
- Telemetry contracts must be symmetric across sinks (`logger` and `Sentry`), not split.
- Add explicit regression tests for telemetry field shape (`operation`, IDs), not just “Sentry called”.
- Include an acceptance-criterion-to-test mapping while implementing, not after.

## TDD Updates Required

- No TDD updates required.
