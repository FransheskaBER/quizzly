import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { api } from '@/store/api';
import authReducer from '@/store/slices/auth.slice';
import quizSubmitReducer from '@/store/slices/quizSubmit.slice';
import quizStreamReducer from '@/store/slices/quizStream.slice';

// Import api slices so their endpoints are injected into the shared api singleton
import '@/api/dashboard.api';
import '@/api/user.api';

import { userApi } from './user.api';

// ---------------------------------------------------------------------------
// Store factory — creates a real Redux store with a fetch-mocked base query
// ---------------------------------------------------------------------------

const buildTestStore = () => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    clone() { return this as unknown as Response; },
    text: async () => '{}',
  } as unknown as Response);

  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
      quizSubmit: quizSubmitReducer,
      quizStream: quizStreamReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });
};

// ---------------------------------------------------------------------------
// Endpoint contract verification
// ---------------------------------------------------------------------------

describe('userApi — endpoint shape', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({}),
      headers: new Headers({ 'Content-Type': 'application/json' }),
      clone() { return this as unknown as Response; },
      text: async () => '{}',
    } as unknown as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes all expected endpoint hooks', () => {
    expect(typeof userApi.endpoints.getApiKeyStatus.initiate).toBe('function');
    expect(typeof userApi.endpoints.saveApiKey.initiate).toBe('function');
    expect(typeof userApi.endpoints.deleteApiKey.initiate).toBe('function');
  });
});
