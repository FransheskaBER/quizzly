import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));
vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

import { prisma } from '../../config/database.js';
import { Sentry } from '../../config/sentry.js';
import { healthService } from '../health.service.js';

describe('healthService.checkDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures database failures and returns disconnected status', async () => {
    const dbError = new Error('connection lost');
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(dbError);

    const result = await healthService.checkDatabase();

    expect(result).toEqual({ db: 'disconnected' });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'health.checkDatabase' }),
      }),
    );
  });
});
