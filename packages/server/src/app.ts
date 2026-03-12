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

/** Strips `x-anthropic-key` from request headers before pino-http logs them. */
export const redactSensitiveHeaders = (req: { headers: Record<string, string>; [key: string]: unknown }): Record<string, unknown> => {
  const { headers, ...rest } = req;
  const safeHeaders = { ...headers };
  delete safeHeaders['x-anthropic-key'];
  return { ...rest, headers: safeHeaders };
};

export const createApp = () => {
  const app = express();
  const logger = pino({ name: 'server' });

  // Render sits behind a load balancer that sets X-Forwarded-For. Trust the
  // first proxy in production so express-rate-limit reads the real client IP.
  // Not set in dev/test — no proxy present, and unconditional trust would let
  // a client spoof X-Forwarded-For and manipulate req.ip.
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // requestIdMiddleware must be first so req.requestId is set before anything
  // can throw (e.g. express.json() on a malformed body), guaranteeing errorHandler
  // always has the requestId available for Sentry context and logging.
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  // genReqId reads the requestId already attached by requestIdMiddleware so that
  // pino-http's req.log child logger carries it — no second pino instance needed.
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.requestId,
    serializers: {
      req: redactSensitiveHeaders,
    },
  }));
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

  // Use a single manual capture path in errorHandler so telemetry context is
  // consistent across mapped 4xx and unhandled 5xx branches.
  app.use(errorHandler);

  return app;
};
