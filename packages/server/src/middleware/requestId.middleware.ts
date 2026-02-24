import { randomUUID } from 'crypto';

import pino from 'pino';
import type { Request, Response, NextFunction } from 'express';

const rootLogger = pino({ name: 'server' });

// Attaches a unique request ID to every incoming request:
//   - req.requestId  — used for Sentry context and response header
//   - req.log        — child pino logger with requestId bound, use in place
//                      of the root logger inside request-scoped code
//   - X-Request-Id   — response header so clients can correlate errors
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = randomUUID();
  req.requestId = requestId;
  req.log = rootLogger.child({ requestId });
  res.setHeader('X-Request-Id', requestId);
  next();
};
