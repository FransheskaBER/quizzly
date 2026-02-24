// Sentry must be initialised before any other imports so it can instrument
// the Express request lifecycle from the start.
import './config/sentry.js';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import pino from 'pino';

import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { globalRateLimiter } from './middleware/rateLimiter.middleware.js';
import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

export const createApp = () => {
  const app = express();
  const logger = pino({ name: 'server' });

  // requestIdMiddleware must be first so req.requestId is set before anything
  // can throw (e.g. express.json() on a malformed body), guaranteeing errorHandler
  // always has the requestId available for Sentry context and logging.
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  // genReqId reads the requestId already attached by requestIdMiddleware so that
  // pino-http's req.log child logger carries it — no second pino instance needed.
  app.use(pinoHttp({ logger, genReqId: (req) => req.requestId }));
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

  // errorHandler calls Sentry.captureException only for 5xx — using a single
  // manual capture path avoids the duplicate events that Sentry.setupExpressErrorHandler
  // would cause (it captures before our 4xx filtering runs).
  app.use(errorHandler);

  return app;
};
