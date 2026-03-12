import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import api slices so their endpoints are injected into the shared api singleton
import '@/api/dashboard.api';
import '@/api/user.api';

import { userApi } from './user.api';

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
