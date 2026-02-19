import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export interface TokenPayload {
  userId: string;
  email: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  // JWT_EXPIRES_IN is a string like "7d" — cast matches jsonwebtoken's accepted type
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (
    typeof decoded === 'string' ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.email !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }

  return { userId: decoded.userId, email: decoded.email };
};

/** SHA-256 hash of a raw token. Used for both verification and reset tokens. */
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
