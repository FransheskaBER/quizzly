import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { Mutex } from 'async-mutex';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const API_BASE_URL = `${API_BASE}/api`;

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
});

// Lazy-loaded mutex to prevent concurrent refresh calls
let refreshMutex: Mutex | null = null;

const getRefreshMutex = async (): Promise<Mutex> => {
  if (!refreshMutex) {
    const { Mutex: MutexClass } = await import('async-mutex');
    refreshMutex = new MutexClass();
  }
  return refreshMutex;
};

export const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =
  async (args, api, extraOptions) => {
    let result = await baseQuery(args, api, extraOptions);

    if (result.error && result.error.status === 401) {
      const endpoint = typeof args === 'string' ? args : args.url;

      // Don't try to refresh if the refresh endpoint itself returned 401
      const isRefreshRequest = endpoint === '/auth/refresh';
      const isSessionCheck = endpoint === '/auth/me';

      if (!isRefreshRequest && !isSessionCheck) {
        const mutex = await getRefreshMutex();

        if (mutex.isLocked()) {
          // Another refresh is in progress — wait for it, then retry
          await mutex.waitForUnlock();
          result = await baseQuery(args, api, extraOptions);
        } else {
          const release = await mutex.acquire();
          try {
            const refreshResult = await baseQuery(
              { url: '/auth/refresh', method: 'POST' },
              api,
              extraOptions,
            );

            if (!refreshResult.error) {
              // Refresh succeeded — retry original request
              result = await baseQuery(args, api, extraOptions);
            } else {
              // Refresh failed — logout
              const { dispatch } = api;
              const { logout } = await import('./slices/auth.slice');
              dispatch(logout());
            }
          } finally {
            release();
          }
        }
      } else if (isRefreshRequest) {
        // Refresh endpoint itself failed — logout
        const { dispatch } = api;
        const { logout } = await import('./slices/auth.slice');
        dispatch(logout());
      }
      // isSessionCheck 401 = "not logged in" — no action needed
    }

    return result;
  };

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Session', 'Dashboard', 'Quiz', 'ApiKeyStatus'],
  endpoints: () => ({}),
});
