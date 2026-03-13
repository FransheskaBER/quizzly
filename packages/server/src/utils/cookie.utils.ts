import type { Response } from 'express';

import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from '@skills-trainer/shared';

import { env } from '../config/env.js';
import { parseExpiresInMs } from './token.utils.js';

const SESSION_COOKIE_NAME = 'quizzly_session';
const REFRESH_COOKIE_NAME = 'quizzly_refresh';

/** Sets the session cookie with the JWT access token. */
export const setSessionCookie = (res: Response, accessToken: string): void => {
  const maxAgeMs = parseExpiresInMs(ACCESS_TOKEN_EXPIRY);
  res.cookie(SESSION_COOKIE_NAME, accessToken, {
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

/** Sets the refresh cookie with the JWT refresh token. */
export const setRefreshCookie = (res: Response, refreshToken: string): void => {
  const maxAgeMs = parseExpiresInMs(REFRESH_TOKEN_EXPIRY);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: maxAgeMs,
  });
};

/** Clears the refresh cookie. */
export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/api/auth/refresh',
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
};

/** Cookie name for refresh token. */
export const getRefreshCookieName = (): string => REFRESH_COOKIE_NAME;
