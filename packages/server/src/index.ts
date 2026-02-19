import 'dotenv/config';
import { env } from './config/env.js';
import { createApp } from './app.js';
import pino from 'pino';

const logger = pino({ name: 'server' });
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

const shutdown = () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
