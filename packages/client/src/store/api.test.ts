import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBaseQuery, mockCaptureException, mockLogout } = vi.hoisted(() => ({
  mockBaseQuery: vi.fn(),
  mockCaptureException: vi.fn(),
  mockLogout: vi.fn(() => ({ type: 'auth/logout' })),
}));

vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));
vi.mock('./slices/auth.slice', () => ({
  logout: mockLogout,
}));
vi.mock('@reduxjs/toolkit/query/react', () => ({
  fetchBaseQuery: vi.fn(() => mockBaseQuery),
  createApi: vi.fn(() => ({ util: {} })),
}));

import { baseQueryWithAuth } from './api';

describe('baseQueryWithAuth unauthorized telemetry (FE-014)', () => {
  beforeEach(() => {
    mockBaseQuery.mockReset();
    mockCaptureException.mockReset();
    mockLogout.mockClear();
  });

  it('skips Sentry capture for GET /auth/me 401 (expected session check)', async () => {
    const dispatch = vi.fn();
    mockBaseQuery.mockResolvedValue({
      error: { status: 401, data: { message: 'Unauthorized' } },
    });

    await baseQueryWithAuth(
      { url: '/auth/me', method: 'GET' },
      { dispatch } as never,
      {} as never,
    );

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });

  it('captures 401 to Sentry for non-session-check endpoints', async () => {
    const dispatch = vi.fn();
    mockBaseQuery.mockResolvedValue({
      error: { status: 401, data: { message: 'Unauthorized' } },
    });

    await baseQueryWithAuth(
      { url: '/sessions', method: 'GET' },
      { dispatch } as never,
      {} as never,
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'autoLogoutOnUnauthorized',
          endpoint: '/sessions',
          method: 'GET',
          status: 401,
        }),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });
});
