import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { REFRESH_TOKEN_EXPIRY } from '@skills-trainer/shared';

import { prisma } from './db.helper.js';
import {
  generateAccessToken,
  generateRefreshToken,
  generateVerificationToken,
  hashToken,
  parseExpiresInMs,
} from '../../utils/token.utils.js';
import { env } from '../../config/env.js';

// Cost factor 1 for speed — bcrypt.compare works regardless of cost factor.
const TEST_BCRYPT_COST = 1;

interface TestUserOverrides {
  email?: string;
  username?: string;
  password?: string;
  emailVerified?: boolean;
}

/**
 * Creates a verified user directly in the DB (bypasses the signup service).
 * Returns the user record and the plaintext password for login tests.
 */
export const createTestUser = async (overrides: TestUserOverrides = {}) => {
  const plaintext = overrides.password ?? 'test-user-password-123!';
  const passwordHash = await bcrypt.hash(plaintext, TEST_BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? 'test@example.com',
      username: overrides.username ?? 'testuser',
      passwordHash,
      emailVerified: overrides.emailVerified ?? true,
    },
  });

  return { user, password: plaintext };
};

/**
 * Creates an unverified user with a valid verification token.
 * Returns the user record, plaintext password, and the raw verification token
 * (what would have been emailed) for use in verify-email tests.
 */
export const createUnverifiedUser = async (overrides: TestUserOverrides & { expiredToken?: boolean } = {}) => {
  const plaintext = overrides.password ?? 'test-user-password-123!';
  const passwordHash = await bcrypt.hash(plaintext, TEST_BCRYPT_COST);
  const { token, hash } = generateVerificationToken();

  const expiresInMs = overrides.expiredToken
    ? -1000 // 1 second in the past
    : 24 * 60 * 60 * 1000; // 24 hours from now

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? 'unverified@example.com',
      username: overrides.username ?? 'unverifieduser',
      passwordHash,
      emailVerified: false,
      verificationToken: hash,
      verificationTokenExpiresAt: new Date(Date.now() + expiresInMs),
    },
  });

  return { user, password: plaintext, verificationToken: token };
};

/**
 * Generates a JWT access token for a user — no DB insert needed.
 * Used to authenticate requests to protected endpoints without going through the login flow.
 */
export const getAuthToken = (user: { id: string; email: string }): string =>
  generateAccessToken({ userId: user.id, email: user.email });

/** Returns an expired JWT access token for testing 401 expiry behavior. */
export const getExpiredAuthToken = (user: { id: string; email: string }): string =>
  jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '0s' });

/**
 * Generates a JWT refresh token and stores its hash in the RefreshToken table.
 * Used for refresh endpoint tests.
 */
export const getRefreshToken = async (user: { id: string; email: string }): Promise<string> => {
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseExpiresInMs(REFRESH_TOKEN_EXPIRY));

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return refreshToken;
};

/** Returns an expired JWT refresh token stored in DB — for testing refresh 401 behavior. */
export const getExpiredRefreshToken = async (user: { id: string; email: string }): Promise<string> => {
  const expiredRefreshToken = jwt.sign(
    { userId: user.id, email: user.email },
    env.REFRESH_SECRET,
    { expiresIn: '0s' },
  );
  const tokenHash = hashToken(expiredRefreshToken);
  const expiresAt = new Date(Date.now() - 60_000); // 1 minute ago

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return expiredRefreshToken;
};
