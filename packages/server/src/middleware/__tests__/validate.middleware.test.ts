import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

import { Sentry } from '../../config/sentry.js';
import { validate } from '../validate.middleware.js';

describe('validate middleware', () => {
  it('captures validation errors before forwarding to next', () => {
    const middleware = validate({ body: z.object({ email: z.string().email() }) });
    const next = vi.fn() as NextFunction;
    const req = {
      body: { email: 'not-an-email' },
      params: {},
      query: {},
      requestId: 'req-2',
      path: '/api/auth/signup',
      method: 'POST',
    } as unknown as Request;

    middleware(req, {} as Response, next);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'validate.middleware.parse',
          schemaTargets: ['body'],
        }),
      }),
    );
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
