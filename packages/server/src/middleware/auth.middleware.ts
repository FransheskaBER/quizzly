import type { Request, Response, NextFunction } from 'express';

import { verifyAccessToken } from '../utils/token.utils.js';
import { getSessionCookieName } from '../utils/cookie.utils.js';
import { UnauthorizedError } from '../utils/errors.js';

export const auth = (req: Request, _res: Response, next: NextFunction): void => {
  const token =
    req.cookies?.[getSessionCookieName()] ??
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) {
    next(new UnauthorizedError('Missing or invalid token'));
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    next(new UnauthorizedError('Invalid or expired token'));
    return;
  }

  req.user = { userId: payload.userId, email: payload.email };
  next();
};
