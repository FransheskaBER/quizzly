## Backend Spec Audit

- **Findings** (ordered by severity)

- **ID**: BE-001
- **Severity**: P0
- **Category**: SilentCatch
- **Location**: `packages/server/src/services/llm.service.ts`
- **Evidence**:
  ```ts
  } catch {
    return null;
  }
  ```
- **Risk**: JSON parse/schema failures are silently dropped, hiding malformed LLM output and making reliability regressions invisible.
- **Required Fix**: Replace bare catch with `catch (err)`, call structured `logger.error` with `{ err, blockName, operation }`, call `Sentry.captureException(err, { extra: {...} })`, and return `null` only after telemetry.
- **Confidence**: High

- **ID**: BE-002
- **Severity**: P0
- **Category**: SilentCatch
- **Location**: `packages/server/src/services/health.service.ts`
- **Evidence**:
  ```ts
  } catch {
    return { db: 'disconnected' };
  }
  ```
- **Risk**: Database connectivity failures are converted to status output with zero telemetry, creating silent outage windows.
- **Required Fix**: Use `catch (err)` and emit `logger.error({ err, operation: 'health.checkDatabase' }, ...)` plus `Sentry.captureException(err, ...)` before returning degraded status.
- **Confidence**: High

- **ID**: BE-003
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/server/src/services/s3.service.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    logger.error({ err, key: input.key, bucket: bucketName }, 'Failed to generate upload URL');
    throw err;
  }
  ```
- **Risk**: S3 signing/delete failures are logged locally but not captured to Sentry, reducing centralized incident visibility.
- **Required Fix**: Add `Sentry.captureException(err, { extra: { key, bucket, operation } })` in all S3 catches (`generateUploadUrl`, `generateDownloadUrl`, `deleteObject` non-`NoSuchKey` branch).
- **Confidence**: High

- **ID**: BE-004
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/server/src/services/material.service.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    logger.warn({ err, materialId }, 'Text extraction failed');
    await prisma.material.update(...);
    throw new BadRequestError(message);
  }
  ```
- **Risk**: URL-fetch/extraction/S3-download failures are transformed or downgraded without Sentry capture, masking repeated extraction incidents.
- **Required Fix**: Add `Sentry.captureException` to all catches in `fetchAndExtractUrl` and `processMaterial`, including context (`materialId`, `url`, `s3Key`, `fileType`, operation).
- **Confidence**: High

- **ID**: BE-005
- **Severity**: P1
- **Category**: MissingSentry
- **Location**: `packages/server/src/services/quiz.service.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to decrypt stored API key');
    throw new BadRequestError('Could not read your saved API key...');
  }
  ```
- **Risk**: BYOK decryption failures in generation/grading prep are user-facing but not captured centrally, hiding key-management failures.
- **Required Fix**: Add `Sentry.captureException(err, { extra: { userId, operation: 'decryptApiKey' } })` in both decrypt catches and keep sanitized user message.
- **Confidence**: High

- **ID**: BE-006
- **Severity**: P1
- **Category**: MissingLogger
- **Location**: `packages/server/src/services/llm.service.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new BadRequestError('Invalid API key...');
    }
    throw err;
  }
  ```
- **Risk**: Provider auth and stream failures are remapped/rethrown without any structured log; root cause and provider metadata can be lost.
- **Required Fix**: Log before remap/rethrow using structured logger context (`provider`, `model`, `operation`, request correlation fields), and capture in Sentry.
- **Confidence**: High

- **ID**: BE-007
- **Severity**: P1
- **Category**: MissingLogger
- **Location**: `packages/server/src/middleware/auth.middleware.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(new UnauthorizedError('Invalid token'));
    }
  }
  ```
- **Risk**: Auth token verification failures become 401 responses with no logger/Sentry signal, obscuring auth subsystem instability or token abuse patterns.
- **Required Fix**: Add structured `logger.error` (or justified `logger.warn`) and `Sentry.captureException` with `requestId`, route, and auth metadata before calling `next`.
- **Confidence**: High

- **ID**: BE-008
- **Severity**: P1
- **Category**: MissingLogger
- **Location**: `packages/server/src/middleware/validate.middleware.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    next(err);
  }
  ```
- **Risk**: Validation parse exceptions are forwarded without local telemetry, violating strict per-catch observability and reducing debugging context at source.
- **Required Fix**: Add structured log + Sentry in catch with route/request context and schema target (`body`, `params`, `query`) before forwarding.
- **Confidence**: High

- **ID**: BE-009
- **Severity**: P1
- **Category**: Other
- **Location**: `packages/server/src/middleware/error.middleware.ts`
- **Evidence**:
  ```ts
  if (err instanceof AppError) {
    res.status(err.statusCode).json(...);
    return;
  }
  ```
- **Risk**: Centralized handler intentionally excludes 4xx from Sentry/logging, which violates this audit's strict requirement and can hide high-volume business failures.
- **Required Fix**: Add at least structured logging and Sentry capture for caught error paths in this scope, or explicitly codify/justify exceptions with alternate telemetry counters.
- **Confidence**: High

- **ID**: BE-010
- **Severity**: P2
- **Category**: LostContext
- **Location**: `packages/server/src/services/material.service.ts`
- **Evidence**:
  ```ts
  } catch (err) {
    logger.error(...);
    await prisma.material.update(...);
    throw new BadRequestError('Failed to download file from storage');
  }
  ```
- **Risk**: If the fallback DB update fails, the original material-processing failure can be overshadowed, reducing root-cause fidelity.
- **Required Fix**: Wrap fallback update in nested try/catch; capture both original and fallback errors, preserving causal chain (`cause`/extra fields).
- **Confidence**: Medium

- **ID**: BE-011
- **Severity**: P2
- **Category**: DuplicateCapture
- **Location**: `packages/server/src/services/email.service.ts`, `packages/server/src/services/auth.service.ts`
- **Evidence**:
  ```ts
  // email.service catch
  Sentry.captureException(err, ...);
  throw new EmailDeliveryError(...);

  // auth.service catch on caller
  Sentry.captureException(err, ...);
  ```
- **Risk**: Same failure can be captured multiple times in a single path, increasing Sentry noise and reducing signal quality.
- **Required Fix**: Capture once per failure path (prefer lowest-level source), or tag/dedupe intentionally repeated captures with explicit rationale.
- **Confidence**: High

- **ID**: BE-012
- **Severity**: P2
- **Category**: UnhandledPromise
- **Location**: `packages/server/src/index.ts`
- **Evidence**:
  ```ts
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  ```
- **Risk**: Missing `unhandledRejection`/`uncaughtException` handlers can drop last-resort telemetry for catastrophic async failures.
- **Required Fix**: Add process-level handlers that log + `Sentry.captureException` and perform graceful shutdown with bounded timeout.
- **Confidence**: Medium

