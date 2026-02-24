// Sentry must be initialised before any other imports so it can instrument
// the Express request lifecycle from the start.
import './config/sentry.js';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import pino from 'pino';
import * as Sentry from '@sentry/node';

import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { globalRateLimiter } from './middleware/rateLimiter.middleware.js';
import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

export const createApp = () => {
  const app = express();
  const logger = pino({ name: 'server' });

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));
  // Attach requestId + child logger to every request before auth and routes
  app.use(requestIdMiddleware);
  app.use(globalRateLimiter);

  app.use('/api', apiRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  // Sentry's Express error handler must come after all routes but before our
  // own errorHandler so Sentry sees the raw error before we format the response.
  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
};
