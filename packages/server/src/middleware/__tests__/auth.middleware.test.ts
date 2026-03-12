import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../utils/token.utils.js', () => ({
  verifyAccessToken: vi.fn(),
}));
vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

import { auth } from '../auth.middleware.js';
import { verifyAccessToken } from '../../utils/token.utils.js';
import { Sentry } from '../../config/sentry.js';
import { UnauthorizedError } from '../../utils/errors.js';

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures and forwards UnauthorizedError when token is expired', () => {
    const expiredError = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw expiredError;
    });

    const req = {
      headers: { authorization: 'Bearer expired-token' },
      requestId: 'req-1',
      path: '/api/protected',
      method: 'GET',
    } as unknown as Request;
    const next = vi.fn() as NextFunction;

    auth(req, {} as Response, next);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expiredError,
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'auth.middleware.verifyAccessToken' }),
      }),
    );
    const passedError = vi.mocked(next).mock.calls[0][0] as Error;
    expect(passedError).toBeInstanceOf(UnauthorizedError);
    expect(passedError.message).toBe('Token expired');
  });
});
