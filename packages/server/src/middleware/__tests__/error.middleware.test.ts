import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../error.middleware.js';
import { Sentry } from '../../config/sentry.js';
import { EmailDeliveryError, ValidationError } from '../../utils/errors.js';

vi.mock('pino', () => ({ default: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

const mockReq = {
  requestId: 'test-req-id',
  user: { userId: 'user-1' },
  method: 'POST',
  path: '/test',
} as unknown as Request;

const mockNext = vi.fn() as NextFunction;

const createMockRes = (): Response => {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
};

describe('errorHandler', () => {
  it('returns 502 with EMAIL_DELIVERY_ERROR for EmailDeliveryError', () => {
    const res = createMockRes();
    const err = new EmailDeliveryError('Failed to send verification email');

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'EMAIL_DELIVERY_ERROR',
        message: 'Failed to send verification email',
        details: undefined,
      },
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'error.middleware.appError' }),
      }),
    );
  });

  it('returns 400 for ValidationError (existing behavior preserved)', () => {
    const res = createMockRes();
    const err = new ValidationError('bad input');

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad input',
        details: undefined,
      },
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'error.middleware.appError' }),
      }),
    );
  });
});
