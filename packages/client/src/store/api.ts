import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { Sentry } from '@/config/sentry';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const API_BASE_URL = `${API_BASE}/api`;

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
});

export const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =
  async (args, api, extraOptions) => {
    const result = await baseQuery(args, api, extraOptions);

    if (result.error && result.error.status === 401) {
      const endpoint = typeof args === 'string' ? args : args.url;
      const method = typeof args === 'string' ? 'GET' : (args.method ?? 'GET');
      const telemetryContext = {
        operation: 'autoLogoutOnUnauthorized',
        endpoint,
        method,
        status: result.error.status,
      };
      // eslint-disable-next-line no-console
      console.error('Auto logout triggered by unauthorized API response', result.error, telemetryContext);
      Sentry.captureException(result.error, { extra: telemetryContext });
      const { dispatch } = api;
      const { logout } = await import('./slices/auth.slice');
      // Clear session cookie server-side (httpOnly cookie cannot be cleared from client)
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch {
        // Ignore — cookie clear is best-effort; state clear below ensures UI updates
      }
      dispatch(logout());
    }

    return result;
  };

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Session', 'Dashboard', 'Quiz', 'ApiKeyStatus'],
  endpoints: () => ({}),
});
