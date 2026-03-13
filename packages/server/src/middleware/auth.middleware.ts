import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { Sentry } from '../config/sentry.js';
import { prisma } from '../config/database.js';
import { hashToken } from '../utils/token.utils.js';
import { getSessionCookieName } from '../utils/cookie.utils.js';
import { UnauthorizedError } from '../utils/errors.js';

const logger = pino({ name: 'auth.middleware' });

export const auth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const token =
    req.cookies?.[getSessionCookieName()] ??
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) {
    next(new UnauthorizedError('Missing or invalid token'));
    return;
  }

  try {
    const tokenHash = hashToken(token);
    const accessToken = await prisma.accessToken.findUnique({
      where: { tokenHash },
      select: {
        userId: true,
        expiresAt: true,
        user: { select: { email: true } },
      },
    });

    if (!accessToken || accessToken.expiresAt < new Date()) {
      next(new UnauthorizedError('Invalid or expired token'));
      return;
    }

    req.user = {
      userId: accessToken.userId,
      email: accessToken.user.email,
    };
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
        operation: 'auth.middleware.tokenLookup',
      },
    });
    next(new UnauthorizedError('Invalid token'));
  }
};
