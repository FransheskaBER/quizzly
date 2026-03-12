import 'dotenv/config';
import { env } from './config/env.js';
import { createApp } from './app.js';
import pino from 'pino';
import { Sentry } from './config/sentry.js';

const logger = pino({ name: 'server' });
const app = createApp();
const SHUTDOWN_TIMEOUT_MS = 10_000 as const;

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

const shutdown = (signal?: NodeJS.Signals): void => {
  logger.info({ signal }, 'Shutting down gracefully');

  const timeoutId = setTimeout(() => {
    logger.error({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  server.close(() => {
    clearTimeout(timeoutId);
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  Sentry.captureException(err, { extra: { operation: 'process.uncaughtException' } });
  shutdown();
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  Sentry.captureException(reason, { extra: { operation: 'process.unhandledRejection' } });
  shutdown();
});
