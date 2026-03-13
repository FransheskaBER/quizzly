import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));
vi.mock('@/store/api', () => ({
  api: {
    injectEndpoints: ({ endpoints }: { endpoints: (builder: unknown) => unknown }) => {
      const builder = {
        mutation: <T>(config: T) => config,
        query: <T>(config: T) => config,
      };
      return { endpoints: endpoints(builder) };
    },
  },
}));

import { authApi } from './auth.api';

describe('authApi getMe hydration telemetry (FE-013)', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
  });

  it('rate-limits 401 hydration telemetry and includes unauthorized context', async () => {
    const onQueryStarted = (
      authApi.endpoints as unknown as {
        getMe: {
          onQueryStarted: (
            args: void,
            api: {
              dispatch: () => void;
              queryFulfilled: Promise<unknown>;
              getState: () => unknown;
            }
          ) => Promise<void>;
        };
      }
    ).getMe.onQueryStarted;

    await onQueryStarted(undefined, {
      dispatch: vi.fn(),
      queryFulfilled: Promise.reject({ error: { status: 401 } }),
      getState: () => ({ auth: { token: 'token-1' } }),
    });
    await onQueryStarted(undefined, {
      dispatch: vi.fn(),
      queryFulfilled: Promise.reject({ error: { status: 401 } }),
      getState: () => ({ auth: { token: 'token-1' } }),
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'getMeHydration',
          route: '/auth/me',
          reason: 'unauthorized',
          status: 401,
          telemetryMode: 'rate-limited',
          originalError: expect.objectContaining({ error: { status: 401 } }),
        }),
      }),
    );
  });

  it('captures non-401 getMe hydration failures with normalized Error', async () => {
    const onQueryStarted = (
      authApi.endpoints as unknown as {
        getMe: {
          onQueryStarted: (
            args: void,
            api: {
              dispatch: () => void;
              queryFulfilled: Promise<unknown>;
              getState: () => unknown;
            }
          ) => Promise<void>;
        };
      }
    ).getMe.onQueryStarted;

    await onQueryStarted(undefined, {
      dispatch: vi.fn(),
      queryFulfilled: Promise.reject({ error: { status: 500 } }),
      getState: () => ({ auth: { token: 'token-1' } }),
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'getMeHydration',
          route: '/auth/me',
          reason: 'non-401',
          status: 500,
        }),
      }),
    );
    const capturedError = mockCaptureException.mock.calls[0][0] as Error;
    expect(capturedError.message).toBe('getMe hydration failed (status: 500)');
  });
});
