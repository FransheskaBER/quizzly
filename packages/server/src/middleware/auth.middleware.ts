import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { Sentry } from '../config/sentry.js';
import { verifyAccessToken } from '../utils/token.utils.js';
import { UnauthorizedError } from '../utils/errors.js';

const logger = pino({ name: 'auth.middleware' });

export const auth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid token'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    logger.warn(
      { err, requestId: req.requestId, path: req.path, method: req.method },
      'Access token verification failed',
    );
    Sentry.captureException(err, {
      extra: {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        operation: 'auth.middleware.verifyAccessToken',
      },
    });
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(new UnauthorizedError('Invalid token'));
    }
  }
};
