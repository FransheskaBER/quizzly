import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const { mockBaseQuery, mockLogout } = vi.hoisted(() => ({
  mockBaseQuery: vi.fn(),
  mockLogout: vi.fn(() => ({ type: 'auth/logout' })),
}));

vi.mock('./slices/auth.slice', () => ({
  logout: mockLogout,
}));
vi.mock('@reduxjs/toolkit/query/react', () => ({
  fetchBaseQuery: vi.fn(() => mockBaseQuery),
  createApi: vi.fn(() => ({ util: {} })),
}));
vi.mock('async-mutex', () => {
  let locked = false;
  const waiters: (() => void)[] = [];
  return {
    Mutex: class {
      isLocked() { return locked; }
      async acquire() {
        locked = true;
        return () => {
          locked = false;
          for (const waiter of waiters.splice(0)) waiter();
        };
      }
      async waitForUnlock() {
        if (!locked) return;
        return new Promise<void>((resolve) => { waiters.push(resolve); });
      }
    },
  };
});

import { baseQueryWithAuth } from './api';

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('baseQueryWithAuth refresh interceptor', () => {
  beforeEach(() => {
    mockBaseQuery.mockReset();
    mockLogout.mockClear();
  });

  it('does not dispatch logout for GET /auth/me 401 (expected session check)', async () => {
    const dispatch = vi.fn();
    mockBaseQuery.mockResolvedValue({
      error: { status: 401, data: { message: 'Unauthorized' } },
    });

    await baseQueryWithAuth(
      { url: '/auth/me', method: 'GET' },
      { dispatch } as never,
      {} as never,
    );

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('attempts refresh on 401 for non-auth endpoints, then retries original request', async () => {
    const dispatch = vi.fn();
    // First call: original request returns 401
    // Second call: refresh succeeds
    // Third call: retry of original request succeeds
    mockBaseQuery
      .mockResolvedValueOnce({ error: { status: 401, data: {} } })
      .mockResolvedValueOnce({ data: { message: 'Token refreshed' } })
      .mockResolvedValueOnce({ data: { sessions: [] } });

    const result = await baseQueryWithAuth(
      { url: '/sessions', method: 'GET' },
      { dispatch } as never,
      {} as never,
    );

    expect(result).toEqual({ data: { sessions: [] } });
    // Refresh was called
    expect(mockBaseQuery).toHaveBeenCalledWith(
      { url: '/auth/refresh', method: 'POST' },
      expect.anything(),
      expect.anything(),
    );
    // No logout dispatch since refresh succeeded
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'auth/logout' });
  });

  it('dispatches logout when refresh endpoint itself returns 401', async () => {
    const dispatch = vi.fn();
    // First call: original request returns 401
    // Second call: refresh also returns 401
    mockBaseQuery
      .mockResolvedValueOnce({ error: { status: 401, data: {} } })
      .mockResolvedValueOnce({ error: { status: 401, data: {} } });

    await baseQueryWithAuth(
      { url: '/sessions', method: 'GET' },
      { dispatch } as never,
      {} as never,
    );

    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });

  it('dispatches logout when POST /auth/refresh returns 401 directly', async () => {
    const dispatch = vi.fn();
    mockBaseQuery.mockResolvedValue({
      error: { status: 401, data: {} },
    });

    await baseQueryWithAuth(
      { url: '/auth/refresh', method: 'POST' },
      { dispatch } as never,
      {} as never,
    );

    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });
});
