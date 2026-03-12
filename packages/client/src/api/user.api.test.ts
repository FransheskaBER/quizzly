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
// AC7 — updateProfile must invalidate the Dashboard cache tag
// ---------------------------------------------------------------------------

describe('userApi — updateProfile invalidates Dashboard cache (AC7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getDashboard query is listed under selectInvalidatedBy("Dashboard") after being primed', async () => {
    const store = buildTestStore();

    // Prime the getDashboard cache so it holds a result that provides 'Dashboard'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await store.dispatch((api as any).endpoints.getDashboard.initiate());

    const state = store.getState();
    const invalidated = api.util.selectInvalidatedBy(state, ['Dashboard']);

    // selectInvalidatedBy returns all cached queries that provide the given tag —
    // a non-empty result proves getDashboard correctly provides the 'Dashboard' tag.
    expect(invalidated.length).toBeGreaterThan(0);
    expect(invalidated[0].endpointName).toBe('getDashboard');
  });

  it('updateProfile invalidates Dashboard and refetches primed getDashboard query', async () => {
    const store = buildTestStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await store.dispatch((api as any).endpoints.getDashboard.initiate());

    const stateBeforeMutation = store.getState();
    const queriesBefore = stateBeforeMutation[api.reducerPath].queries;
    const dashboardKey = Object.keys(queriesBefore).find((k) => k.startsWith('getDashboard'));
    expect(dashboardKey).toBeDefined();

    const initialEntry = queriesBefore[dashboardKey!];
    const initialFulfilledTime = initialEntry?.fulfilledTimeStamp;
    expect(typeof initialFulfilledTime).toBe('number');

    await store.dispatch(userApi.endpoints.updateProfile.initiate({ username: 'new-name' }));
    await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));

    const stateAfterMutation = store.getState();
    const updatedEntry = stateAfterMutation[api.reducerPath].queries[dashboardKey!];
    expect(typeof updatedEntry?.fulfilledTimeStamp).toBe('number');
    expect(updatedEntry?.fulfilledTimeStamp).toBeGreaterThan(initialFulfilledTime as number);
  });

  it('updateProfile endpoint exists and is a mutation', () => {
    expect(typeof userApi.endpoints.updateProfile.initiate).toBe('function');
    expect(typeof userApi.endpoints.updateProfile.matchFulfilled).toBe('function');
  });
});

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
    expect(typeof userApi.endpoints.updateProfile.initiate).toBe('function');
    expect(typeof userApi.endpoints.changePassword.initiate).toBe('function');
  });
});
