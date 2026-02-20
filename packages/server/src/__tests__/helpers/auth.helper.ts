import bcrypt from 'bcryptjs';
import { prisma } from './db.helper.js';
import { generateAccessToken } from '../../utils/token.utils.js';
import { generateVerificationToken } from '../../utils/token.utils.js';

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
  const plaintext = overrides.password ?? 'TestPassword123!';
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
  const plaintext = overrides.password ?? 'TestPassword123!';
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
 * Generates a valid JWT for a given user — used to authenticate requests
 * to protected endpoints without going through the login flow.
 */
export const getAuthToken = (user: { id: string; email: string }): string => {
  return generateAccessToken({ userId: user.id, email: user.email });
};
