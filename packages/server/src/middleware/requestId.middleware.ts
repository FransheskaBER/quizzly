import { randomUUID } from 'crypto';

import type { Request, Response, NextFunction } from 'express';

// Runs first in the middleware chain — before express.json() or anything that
// can throw — so req.requestId is guaranteed to be set when errorHandler runs.
//
// req.log is set here as a fallback for the narrow window before pinoHttp runs.
// pinoHttp (registered immediately after) calls genReqId to read req.requestId
// and binds it into its own child logger, which then overwrites req.log. Any
// code running after pinoHttp (routes, services, errorHandler) gets a logger
// that has both pino-http's request context AND the requestId.
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
