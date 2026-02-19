import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

interface TokenPayload {
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

export const generateVerificationToken = (): string => {
  return randomBytes(32).toString('hex');
};

export const generateResetToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
};
