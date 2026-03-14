import pino from 'pino';

import {
  VERIFICATION_TOKEN_EXPIRY_HOURS,
  RESET_TOKEN_EXPIRY_HOURS,
  REFRESH_TOKEN_EXPIRY,
} from '@skills-trainer/shared';
import type {
  SignupRequest,
  LoginRequest,
  VerifyEmailRequest,
  ResendVerificationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  LoginResponse,
  UserResponse,
  MessageResponse,
} from '@skills-trainer/shared';

import { prisma } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.utils.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateVerificationToken,
  generateResetToken,
  hashToken,
  parseExpiresInMs,
} from '../utils/token.utils.js';
import {
  ConflictError,
  UnauthorizedError,
  EmailNotVerifiedError,
  BadRequestError,
  NotFoundError,
} from '../utils/errors.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.service.js';

const logger = pino({ name: 'auth.service' });

export const signup = async (data: SignupRequest): Promise<MessageResponse> => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(data.password);
  const { token: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
  const verificationTokenExpiresAt = new Date(
    Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  );

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      emailVerified: false,
      verificationToken: verificationTokenHash, // store hash; raw token goes via email
      verificationTokenExpiresAt,
    },
  });

  await sendVerificationEmail(user.email, verificationToken);

  return { message: 'Account created. Please check your email to verify.' };
};

/** Internal: includes tokens for cookie setting. Route strips before sending to client. */
export interface LoginResult extends LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export const login = async (data: LoginRequest): Promise<LoginResult> => {
  const user = await prisma.user.findUnique({ where: { email: data.email } });

  // Same error message whether email or password is wrong — never reveal which
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordMatch = await comparePassword(data.password, user.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.emailVerified) {
    throw new EmailNotVerifiedError('Please verify your email before logging in');
  }

  const tokenPayload = { userId: user.id, email: user.email };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseExpiresInMs(REFRESH_TOKEN_EXPIRY));

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    },
  });

  return {
    user: { id: user.id, email: user.email, username: user.username },
    accessToken,
    refreshToken,
  };
};

/** Verify refresh token JWT → find hash in DB → rotate tokens. */
export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export const refreshAccessToken = async (oldRefreshToken: string): Promise<RefreshResult> => {
  const payload = verifyRefreshToken(oldRefreshToken);
  if (!payload) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const oldTokenHash = hashToken(oldRefreshToken);

  // Atomic delete — if a concurrent request already rotated this token, count is 0.
  const { count } = await prisma.refreshToken.deleteMany({
    where: { tokenHash: oldTokenHash },
  });

  if (count === 0) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Generate new token pair
  const tokenPayload = { userId: payload.userId, email: payload.email };
  const accessToken = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + parseExpiresInMs(REFRESH_TOKEN_EXPIRY));

  await prisma.refreshToken.create({
    data: {
      userId: payload.userId,
      tokenHash: newRefreshTokenHash,
      expiresAt,
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
};

/** Delete all refresh tokens for a user (revoke all sessions). */
export const logout = async (userId: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
};

export const verifyEmail = async (data: VerifyEmailRequest): Promise<MessageResponse> => {
  const tokenHash = hashToken(data.token);
  const user = await prisma.user.findUnique({
    where: { verificationToken: tokenHash },
  });

  if (!user) {
    throw new BadRequestError('Invalid or expired verification link');
  }

  // Check already-verified before expiry so a re-click always gets the right message.
  if (user.emailVerified) {
    throw new ConflictError('Email already verified');
  }

  if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
    throw new BadRequestError('Verification link has expired');
  }

  // Keep the token in the DB so future re-clicks can still find this user and
  // return the "already verified" ConflictError above instead of "invalid link".
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  return { message: 'Email verified successfully.' };
};

export const resendVerification = async (
  data: ResendVerificationRequest,
): Promise<MessageResponse> => {
  const genericResponse: MessageResponse = {
    message: 'If an account exists, a verification link has been sent.',
  };

  const user = await prisma.user.findUnique({ where: { email: data.email } });

  // Return generic message for non-existent or already-verified — never reveal which
  if (!user || user.emailVerified) {
    return genericResponse;
  }

  const { token: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
  const verificationTokenExpiresAt = new Date(
    Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken: verificationTokenHash, verificationTokenExpiresAt },
  });

  // SECURITY: Catch email failure and return generic response to prevent email enumeration.
  // Attacker must not distinguish "email doesn't exist/already verified" from
  // "email exists, unverified, but delivery failed".
  try {
    await sendVerificationEmail(user.email, verificationToken);
  } catch (err) {
    logger.error({ err, email: user.email }, 'Verification email failed');
    return genericResponse;
  }

  return genericResponse;
};

export const forgotPassword = async (data: ForgotPasswordRequest): Promise<MessageResponse> => {
  const genericResponse: MessageResponse = {
    message: 'If an account exists, a reset link has been sent.',
  };

  const user = await prisma.user.findUnique({ where: { email: data.email } });

  if (!user) {
    return genericResponse;
  }

  const { token, hash } = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt,
    },
  });

  // SECURITY: Catch email failure and return generic response to prevent email enumeration.
  // Attacker must not distinguish "email doesn't exist" from "email exists but delivery failed".
  try {
    await sendPasswordResetEmail(user.email, token);
  } catch (err) {
    logger.error({ err, email: user.email }, 'Password reset email failed');
    return genericResponse;
  }

  return genericResponse;
};

export const resetPassword = async (data: ResetPasswordRequest): Promise<MessageResponse> => {
  const tokenHash = hashToken(data.token);

  const resetRecord = await prisma.passwordReset.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!resetRecord) {
    throw new BadRequestError('Invalid or expired reset link');
  }

  const newPasswordHash = await hashPassword(data.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { message: 'Password reset successfully.' };
};

export const getMe = async (userId: string): Promise<UserResponse> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.emailVerified,
    hasUsedFreeTrial: user.freeTrialUsedAt !== null,
    hasApiKey: user.encryptedApiKey !== null,
    createdAt: user.createdAt.toISOString(),
  };
};

/**
 * Verify email by address without using the email link. Used by E2E (NODE_ENV=test)
 * and by the development-only route (NODE_ENV=development). Not exposed in production.
 */
export const verifyEmailByAddress = async (email: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
};
