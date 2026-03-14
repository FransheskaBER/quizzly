import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from '@skills-trainer/shared';

import { env } from '../config/env.js';

export interface TokenPayload {
  userId: string;
  email: string;
}

/** SHA-256 hash of a raw token. Used for refresh tokens, verification, and reset tokens. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Returns a raw random token and its SHA-256 hash.
 *  Store the hash; send the raw token via email. */
export const generateVerificationToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
};

export const generateResetToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
};

/** Parses expiry string (e.g. "7d", "24h") into milliseconds. Used for cookie maxAge. */
export const parseExpiresInMs = (s: string): number => {
  const match = /^(\d+)(d|h|m|s)$/.exec(s.trim().toLowerCase());
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const [, n, unit] = match;
  const num = parseInt(n!, 10);
  switch (unit) {
    case 'd': return num * 24 * 60 * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'm': return num * 60 * 1000;
    case 's': return num * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
};

/** Signs a JWT access token with JWT_SECRET, 15min expiry. */
export const generateAccessToken = (payload: TokenPayload): string =>
  jwt.sign({ userId: payload.userId, email: payload.email }, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

/** Signs a JWT refresh token with REFRESH_SECRET, 7d expiry. */
export const generateRefreshToken = (payload: TokenPayload): string =>
  jwt.sign({ userId: payload.userId, email: payload.email }, env.REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

/** Validates that a decoded JWT contains the expected userId and email claims. */
const extractPayload = (decoded: jwt.JwtPayload): TokenPayload | null => {
  if (typeof decoded.userId !== 'string' || typeof decoded.email !== 'string') {
    return null;
  }
  return { userId: decoded.userId, email: decoded.email };
};

/** Verifies a JWT access token. Returns payload or null if invalid/expired/malformed. */
export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    return extractPayload(decoded);
  } catch {
    return null;
  }
};

/** Verifies a JWT refresh token. Returns payload or null if invalid/expired/malformed. */
export const verifyRefreshToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.REFRESH_SECRET) as jwt.JwtPayload;
    return extractPayload(decoded);
  } catch {
    return null;
  }
};
