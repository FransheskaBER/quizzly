import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { errorHandler } from '../error.middleware.js';
import { Sentry } from '../../config/sentry.js';
import {
  EmailDeliveryError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors.js';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('does not capture expected login failure (Invalid email or password) on POST /api/auth/login', () => {
    const res = createMockRes();
    const loginReq = {
      ...mockReq,
      path: '/api/auth/login',
      originalUrl: '/api/auth/login',
      method: 'POST',
    } as unknown as Request;
    const err = new UnauthorizedError('Invalid email or password');

    errorHandler(err, loginReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
        details: undefined,
      },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captures UnauthorizedError on other paths (e.g. missing token on /api/auth/me)', () => {
    const res = createMockRes();
    const meReq = { ...mockReq, path: '/api/auth/me', method: 'GET' } as unknown as Request;
    const err = new UnauthorizedError('Not authenticated');

    errorHandler(err, meReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
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

  it('captures Prisma unknown code only once in unhandled path', () => {
    const res = createMockRes();
    const prismaError = Object.assign(
      Object.create(PrismaClientKnownRequestError.prototype) as PrismaClientKnownRequestError,
      {
        code: 'P9999',
        message: 'Unknown Prisma request error',
        name: 'PrismaClientKnownRequestError',
      },
    );

    errorHandler(prismaError, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      prismaError,
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'error.middleware.unhandled' }),
      }),
    );
  });
});
