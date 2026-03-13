import type { Response } from 'express';
import { env } from '../config/env.js';
import { parseExpiresInMs } from './token.utils.js';

const SESSION_COOKIE_NAME = 'quizzly_session';

/** Sets the session cookie with the raw access token. */
export const setSessionCookie = (res: Response, rawToken: string): void => {
  const maxAgeMs = parseExpiresInMs(env.JWT_EXPIRES_IN);
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: maxAgeMs,
  });
};

/** Clears the session cookie. */
export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/api',
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
};

/** Cookie name for session token (used by auth middleware). */
export const getSessionCookieName = (): string => SESSION_COOKIE_NAME;
