import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));

import { useSSEStream } from './useSSEStream';

describe('useSSEStream telemetry catches (FE-002, FE-004)', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
    vi.restoreAllMocks();
  });

  it('captures malformed SSE event parse failures with stream metadata', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"broken"\n\n') })
      .mockResolvedValueOnce({ done: true, value: undefined });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => ({ read }) },
      }),
    );

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useSSEStream({
        onEvent,
        onError,
        onComplete,
        token: 'token',
      }),
    );

    act(() => {
      result.current.start('/api/stream');
    });

    await waitFor(() => {
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(SyntaxError),
        expect.objectContaining({
          extra: expect.objectContaining({
            operation: 'parseSseEvent',
            url: '/api/stream',
          }),
        }),
      );
    });
  });

  it('captures stream transport failures and reports error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useSSEStream({
        onEvent,
        onError,
        onComplete,
        token: 'token',
      }),
    );

    act(() => {
      result.current.start('/api/stream');
    });

    await waitFor(() => {
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            operation: 'startSseStream',
            url: '/api/stream',
            method: 'GET',
          }),
        }),
      );
      expect(onError).toHaveBeenCalledWith('Connection failed. Please check your connection and try again.');
    });
  });
});
