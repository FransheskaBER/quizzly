import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const {
  mockDispatch,
  mockStart,
  mockClose,
  mockUseSSEStream,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockStart: vi.fn(),
  mockClose: vi.fn(),
  mockUseSSEStream: vi.fn(),
}));

vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      auth: { token: 'token-123' },
      quizStream: {
        status: 'idle',
        questions: [],
        quizAttemptId: null,
        error: null,
        totalExpected: 0,
      },
    }),
}));

vi.mock('@/hooks/useSSEStream', () => ({
  useSSEStream: mockUseSSEStream,
}));

import { useQuizGeneration } from './useQuizGeneration';

describe('useQuizGeneration progress message behavior', () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockStart.mockReset();
    mockClose.mockReset();
    mockUseSSEStream.mockReset();

    mockUseSSEStream.mockImplementation((options: { onEvent: (event: { type: string; message?: string }) => void }) => ({
      start: mockStart,
      close: mockClose,
      warning: null,
      status: 'idle',
      _options: options,
    }));
  });

  it('maps "Analyzing materials..." to "Generating your quiz..." (AC4)', () => {
    const { result } = renderHook(() => useQuizGeneration('session-123'));
    const firstCallArg = mockUseSSEStream.mock.calls[0]?.[0] as {
      onEvent: (event: { type: string; message?: string }) => void;
    };

    act(() => {
      firstCallArg.onEvent({ type: 'progress', message: 'Analyzing materials...' });
    });

    expect(result.current.progressMessage).toBe('Generating your quiz...');
  });

  it('keeps non-target progress messages unchanged (AC5)', () => {
    const { result } = renderHook(() => useQuizGeneration('session-123'));
    const firstCallArg = mockUseSSEStream.mock.calls[0]?.[0] as {
      onEvent: (event: { type: string; message?: string }) => void;
    };

    act(() => {
      firstCallArg.onEvent({ type: 'progress', message: 'Generating question 2/10...' });
    });

    expect(result.current.progressMessage).toBe('Generating question 2/10...');
  });
});
