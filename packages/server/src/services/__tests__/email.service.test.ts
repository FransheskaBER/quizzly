import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock so we test the real implementation (setup.ts mocks it globally for other tests).
vi.unmock('../email.service.js');

// vi.hoisted runs before vi.mock factories, so mockLogger is available to the pino mock.
const { mockLogger } = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: typeof logger) {
      return this;
    }),
    level: 'info',
    silent: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  return { mockLogger: logger };
});

vi.mock('pino', () => ({ default: () => mockLogger }));

vi.mock('../../config/resend.js', () => ({
  resendClient: {
    emails: { send: vi.fn() },
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    EMAIL_FROM: 'noreply@test.com',
    CLIENT_URL: 'https://app.test.com',
  },
}));

vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

import { resendClient } from '../../config/resend.js';
import { env } from '../../config/env.js';
import { Sentry } from '../../config/sentry.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.service.js';
import { EmailDeliveryError } from '../../utils/errors.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sendVerificationEmail — Resend returns { error }
// ---------------------------------------------------------------------------
describe('sendVerificationEmail when Resend returns error', () => {
  it('logs error, captures to Sentry, and throws EmailDeliveryError', async () => {
    const resendError = { message: 'Domain not verified', statusCode: 403 };
    vi.mocked(resendClient.emails.send).mockResolvedValue({
      data: null,
      error: resendError,
    } as Awaited<ReturnType<typeof resendClient.emails.send>>);

    await expect(
      sendVerificationEmail('user@example.com', 'token-123'),
    ).rejects.toThrow(EmailDeliveryError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: resendError, to: 'user@example.com', from: 'Quizzly AI <noreply@test.com>' },
      'Failed to send verification email',
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(resendError, {
      extra: { to: 'user@example.com', from: 'Quizzly AI <noreply@test.com>' },
    });
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendVerificationEmail — success path
// ---------------------------------------------------------------------------
describe('sendVerificationEmail when Resend succeeds', () => {
  it('logs success and does not call logger.error or Sentry.captureException', async () => {
    vi.mocked(resendClient.emails.send).mockResolvedValue({
      data: { id: 'email-id-abc' },
      error: null,
    } as Awaited<ReturnType<typeof resendClient.emails.send>>);

    await sendVerificationEmail('user@example.com', 'token-123');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { id: 'email-id-abc', to: 'user@example.com' },
      'Verification email sent',
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendPasswordResetEmail — Resend returns { error }
// ---------------------------------------------------------------------------
describe('sendPasswordResetEmail when Resend returns error', () => {
  it('logs error, captures to Sentry, and throws EmailDeliveryError', async () => {
    const resendError = { message: 'Invalid API key', statusCode: 401 };
    vi.mocked(resendClient.emails.send).mockResolvedValue({
      data: null,
      error: resendError,
    } as Awaited<ReturnType<typeof resendClient.emails.send>>);

    await expect(
      sendPasswordResetEmail('user@example.com', 'token-456'),
    ).rejects.toThrow(EmailDeliveryError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: resendError, to: 'user@example.com', from: 'Quizzly AI <noreply@test.com>' },
      'Failed to send password reset email',
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(resendError, {
      extra: { to: 'user@example.com', from: 'Quizzly AI <noreply@test.com>' },
    });
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendPasswordResetEmail — success path
// ---------------------------------------------------------------------------
describe('sendPasswordResetEmail when Resend succeeds', () => {
  it('logs success and does not call logger.error or Sentry.captureException', async () => {
    vi.mocked(resendClient.emails.send).mockResolvedValue({
      data: { id: 'email-id-xyz' },
      error: null,
    } as Awaited<ReturnType<typeof resendClient.emails.send>>);

    await sendPasswordResetEmail('user@example.com', 'token-456');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { id: 'email-id-xyz', to: 'user@example.com' },
      'Password reset email sent',
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// EMAIL_FROM not configured — early return without throwing
// ---------------------------------------------------------------------------
describe('sendVerificationEmail when EMAIL_FROM is not configured', () => {
  it('warns and returns without sending or throwing', async () => {
    const originalEmailFrom = env.EMAIL_FROM;
    (env as { EMAIL_FROM: string }).EMAIL_FROM = '';
    try {
      await sendVerificationEmail('user@example.com', 'token-123');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { to: 'user@example.com' },
        'EMAIL_FROM not configured — skipping verification email',
      );
      expect(resendClient.emails.send).not.toHaveBeenCalled();
    } finally {
      (env as { EMAIL_FROM: string }).EMAIL_FROM = originalEmailFrom;
    }
  });
});

describe('sendPasswordResetEmail when EMAIL_FROM is not configured', () => {
  it('warns and returns without sending or throwing', async () => {
    const originalEmailFrom = env.EMAIL_FROM;
    (env as { EMAIL_FROM: string }).EMAIL_FROM = '';
    try {
      await sendPasswordResetEmail('user@example.com', 'token-456');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { to: 'user@example.com' },
        'EMAIL_FROM not configured — skipping password reset email',
      );
      expect(resendClient.emails.send).not.toHaveBeenCalled();
    } finally {
      (env as { EMAIL_FROM: string }).EMAIL_FROM = originalEmailFrom;
    }
  });
});
