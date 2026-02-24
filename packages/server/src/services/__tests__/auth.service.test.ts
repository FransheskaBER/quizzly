import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock calls are hoisted to run before imports — mock factory can use vi.fn()
vi.mock('../../config/database.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passwordReset: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../email.service.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

// password.utils is mocked for speed (bcrypt cost 12 ≈ 250ms per hash)
vi.mock('../../utils/password.utils.js', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.service.js';
import { hashPassword, comparePassword } from '../../utils/password.utils.js';
import * as authService from '../auth.service.js';
import {
  ConflictError,
  UnauthorizedError,
  EmailNotVerifiedError,
  BadRequestError,
  NotFoundError,
} from '../../utils/errors.js';

// Base user record that matches the Prisma User shape
const mockUser = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  username: 'testuser',
  passwordHash: 'hashed_password',
  emailVerified: true,
  verificationToken: null,
  verificationTokenExpiresAt: null,
  authProvider: 'email',
  googleId: null,
  subscriptionTier: 'free',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hashPassword).mockResolvedValue('hashed_password');
  vi.mocked(comparePassword).mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// signup
// ---------------------------------------------------------------------------
describe('signup', () => {
  it('creates a user with correct fields and sends verification email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...mockUser, emailVerified: false });

    const result = await authService.signup({
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    });

    expect(result.message).toMatch(/Account created/i);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    expect(hashPassword).toHaveBeenCalledWith('Password123!');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'test@example.com',
          username: 'testuser',
          passwordHash: 'hashed_password',
          emailVerified: false,
        }),
      }),
    );
    expect(sendVerificationEmail).toHaveBeenCalledWith('test@example.com', expect.any(String));
  });

  it('stores the hashed password, not the plaintext', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...mockUser, emailVerified: false });
    vi.mocked(hashPassword).mockResolvedValue('$2b$12$fake_bcrypt_hash');

    await authService.signup({
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    });

    const createData = vi.mocked(prisma.user.create).mock.calls[0][0].data;
    expect(createData.passwordHash).toBe('$2b$12$fake_bcrypt_hash');
    expect(createData.passwordHash).not.toBe('Password123!');
  });

  it('sets verificationTokenExpiresAt approximately 24 hours from now', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...mockUser, emailVerified: false });

    const before = Date.now();
    await authService.signup({
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    });
    const after = Date.now();

    const createData = vi.mocked(prisma.user.create).mock.calls[0][0].data;
    const expiry = (createData.verificationTokenExpiresAt as Date).getTime();
    expect(expiry).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(expiry).toBeLessThan(after + 25 * 60 * 60 * 1000);
  });

  it('throws ConflictError when email is already registered', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    await expect(
      authService.signup({ email: 'test@example.com', username: 'other', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
describe('login', () => {
  it('returns a JWT token and user profile for valid verified credentials', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, emailVerified: true });
    vi.mocked(comparePassword).mockResolvedValue(true);

    const result = await authService.login({
      email: 'test@example.com',
      password: 'Password123!',
    });

    expect(result.token).toBeTypeOf('string');
    expect(result.token.split('.')).toHaveLength(3);
    expect(result.user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
    });
  });

  it('JWT payload contains the correct userId and email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, emailVerified: true });
    vi.mocked(comparePassword).mockResolvedValue(true);

    const { token } = await authService.login({
      email: 'test@example.com',
      password: 'Password123!',
    });

    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    expect(payload.userId).toBe(mockUser.id);
    expect(payload.email).toBe(mockUser.email);
  });

  it('throws UnauthorizedError when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(comparePassword).mockResolvedValue(false);

    await expect(
      authService.login({ email: 'test@example.com', password: 'WrongPassword!' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('uses the same error message whether email or password is wrong (no leaking)', async () => {
    let emailErrorMsg: string | undefined;
    let passwordErrorMsg: string | undefined;

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    try {
      await authService.login({ email: 'nobody@example.com', password: 'anything' });
    } catch (e) {
      emailErrorMsg = (e as Error).message;
    }

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(comparePassword).mockResolvedValue(false);
    try {
      await authService.login({ email: 'test@example.com', password: 'wrong' });
    } catch (e) {
      passwordErrorMsg = (e as Error).message;
    }

    expect(emailErrorMsg).toBeDefined();
    expect(emailErrorMsg).toBe(passwordErrorMsg);
  });

  it('throws EmailNotVerifiedError when email is not verified', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, emailVerified: false });
    vi.mocked(comparePassword).mockResolvedValue(true);

    await expect(
      authService.login({ email: 'test@example.com', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------
describe('verifyEmail', () => {
  const verifiableUser = {
    ...mockUser,
    emailVerified: false,
    verificationToken: 'stored_hash',
    verificationTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  };

  it('sets emailVerified=true and keeps token in DB for a valid token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiableUser);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...verifiableUser, emailVerified: true });

    const result = await authService.verifyEmail({ token: 'raw_token' });

    expect(result.message).toMatch(/verified/i);
    // Token is NOT cleared — keeping it lets re-clicks find the user and return
    // "already verified" (CONFLICT) instead of "invalid link" (BAD_REQUEST).
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: verifiableUser.id },
      data: { emailVerified: true },
    });
  });

  it('throws BadRequestError when token is invalid (no user found for hash)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(authService.verifyEmail({ token: 'invalid' })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError with "expired" message for expired token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...verifiableUser,
      verificationTokenExpiresAt: new Date(Date.now() - 1000), // in the past
    });

    await expect(authService.verifyEmail({ token: 'raw_token' })).rejects.toMatchObject({
      message: expect.stringMatching(/expired/i),
    });
  });

  it('throws ConflictError when email is already verified', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...verifiableUser, emailVerified: true });

    await expect(authService.verifyEmail({ token: 'raw_token' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

// ---------------------------------------------------------------------------
// resendVerification
// ---------------------------------------------------------------------------
describe('resendVerification', () => {
  it('updates verification token and sends email for an unverified user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, emailVerified: false });
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, emailVerified: false });

    const result = await authService.resendVerification({ email: 'test@example.com' });

    expect(result.message).toBeTruthy();
    expect(prisma.user.update).toHaveBeenCalled();
    expect(sendVerificationEmail).toHaveBeenCalledWith('test@example.com', expect.any(String));
  });

  it('returns generic message without any DB write when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await authService.resendVerification({ email: 'nobody@example.com' });

    expect(result.message).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns generic message without emailing when user is already verified', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, emailVerified: true });

    const result = await authService.resendVerification({ email: 'test@example.com' });

    expect(result.message).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// forgotPassword
// ---------------------------------------------------------------------------
describe('forgotPassword', () => {
  it('creates a password reset record and sends email for an existing user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.passwordReset.create).mockResolvedValue({} as never);

    const result = await authService.forgotPassword({ email: 'test@example.com' });

    expect(result.message).toBeTruthy();
    expect(prisma.passwordReset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: mockUser.id,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com', expect.any(String));
  });

  it('stores the token hash (not the raw token) in the DB', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.passwordReset.create).mockResolvedValue({} as never);

    await authService.forgotPassword({ email: 'test@example.com' });

    const storedHash = vi.mocked(prisma.passwordReset.create).mock.calls[0][0].data.tokenHash;
    const rawToken = vi.mocked(sendPasswordResetEmail).mock.calls[0][1]; // second arg

    expect(rawToken).not.toBe(storedHash);
    // SHA-256 hash is always 64 hex chars
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns generic message without any DB write or email when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await authService.forgotPassword({ email: 'nobody@example.com' });

    expect(result.message).toBeTruthy();
    expect(prisma.passwordReset.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------
describe('resetPassword', () => {
  const mockReset = {
    id: 'reset-uuid-123',
    userId: mockUser.id,
    tokenHash: 'some_hash',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
  };

  it('hashes the new password and runs a transaction for a valid token', async () => {
    vi.mocked(prisma.passwordReset.findFirst).mockResolvedValue(mockReset);
    vi.mocked(hashPassword).mockResolvedValue('new_hashed_password');
    vi.mocked(prisma.$transaction).mockResolvedValue([mockUser, mockReset]);

    const result = await authService.resetPassword({
      token: 'valid_token',
      password: 'NewPassword123!',
    });

    expect(result.message).toBeTruthy();
    expect(hashPassword).toHaveBeenCalledWith('NewPassword123!');
    expect(prisma.$transaction).toHaveBeenCalled();

    // Transaction receives an array of two operations.
    // Double-cast through unknown because Prisma's $transaction overloads
    // make a direct cast to unknown[] fail the overlap check in tsc.
    const transactionArg = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(transactionArg).toHaveLength(2);
  });

  it('throws BadRequestError for an invalid, expired, or already-used token', async () => {
    vi.mocked(prisma.passwordReset.findFirst).mockResolvedValue(null);

    await expect(
      authService.resetPassword({ token: 'bad_token', password: 'NewPassword123!' }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getMe
// ---------------------------------------------------------------------------
describe('getMe', () => {
  it('returns the user profile for an existing user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

    const result = await authService.getMe(mockUser.id);

    expect(result).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      emailVerified: mockUser.emailVerified,
      createdAt: mockUser.createdAt.toISOString(),
    });
  });

  it('throws NotFoundError when the user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(authService.getMe('nonexistent-id')).rejects.toBeInstanceOf(NotFoundError);
  });
});
