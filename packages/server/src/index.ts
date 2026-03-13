import 'dotenv/config';
import { env } from './config/env.js';
import { createApp } from './app.js';
import pino from 'pino';
import { Sentry } from './config/sentry.js';
import { createShutdownManager } from './utils/process-shutdown.utils.js';
import { toSentryError } from './utils/sentry.utils.js';

const logger = pino({ name: 'server' });
const app = createApp();
const SHUTDOWN_TIMEOUT_MS = 10_000 as const;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000 as const;

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

const { shutdown } = createShutdownManager({
  logger,
  server,
  flushSentry: Sentry.flush,
  exitProcess: (exitCode) => process.exit(exitCode),
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentryFlushTimeoutMs: SENTRY_FLUSH_TIMEOUT_MS,
});

process.on('SIGTERM', () => shutdown({ signal: 'SIGTERM', exitCode: 0, shouldFlushSentry: false }));
process.on('SIGINT', () => shutdown({ signal: 'SIGINT', exitCode: 0, shouldFlushSentry: false }));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  const sentryError = toSentryError(err, 'Uncaught exception');
  Sentry.captureException(sentryError, {
    extra: { operation: 'process.uncaughtException', originalError: err },
  });
  shutdown({ exitCode: 1, shouldFlushSentry: true });
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  const sentryError = toSentryError(reason, 'Unhandled promise rejection');
  Sentry.captureException(sentryError, {
    extra: { operation: 'process.unhandledRejection', originalError: reason },
  });
  shutdown({ exitCode: 1, shouldFlushSentry: true });
});
