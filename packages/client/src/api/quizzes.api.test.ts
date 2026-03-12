import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCaptureException, mockInjectEndpoints, capturedEndpoints } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockInjectEndpoints: vi.fn(),
  capturedEndpoints: { current: null as null | Record<string, unknown> },
}));

vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));
vi.mock('@/store/api', () => ({
  api: {
    injectEndpoints: mockInjectEndpoints.mockImplementation(({ endpoints }: { endpoints: (builder: unknown) => unknown }) => {
      const builder = {
        mutation: <T>(config: T) => config,
        query: <T>(config: T) => config,
      };
      const builtEndpoints = endpoints(builder) as Record<string, unknown>;
      capturedEndpoints.current = builtEndpoints;
      const util = {
        updateQueryData: vi.fn(() => ({ type: 'api/update' })),
      };
      return { endpoints: builtEndpoints, util };
    }),
  },
}));

import './quizzes.api';

describe('quizzesApi optimistic rollback telemetry (FE-003)', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
  });

  it('captures saveAnswers optimistic rollback failures with endpoint and quizId', async () => {
    const endpoints = capturedEndpoints.current as {
      saveAnswers: {
        onQueryStarted: (
          args: { id: string; answers: Array<{ questionId: string; answer: string }> },
          apiHelpers: { dispatch: (action: unknown) => { undo: () => void }; queryFulfilled: Promise<unknown> },
        ) => Promise<void>;
      };
    };

    const undo = vi.fn();
    const dispatch = vi.fn(() => ({ undo }));

    await endpoints.saveAnswers.onQueryStarted(
      { id: 'quiz-1', answers: [{ questionId: 'q1', answer: 'A' }] },
      {
        dispatch,
        queryFulfilled: Promise.reject(new Error('save failed')),
      },
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          endpoint: 'saveAnswers',
          quizId: 'quiz-1',
        }),
      }),
    );
    expect(undo).toHaveBeenCalled();
  });
});
