import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuizStatus } from '@skills-trainer/shared';

const {
  mockSaveAnswers,
  mockSubmitQuiz,
  mockShowError,
  mockShowSuccess,
  mockCaptureException,
  mockDispatch,
} = vi.hoisted(() => ({
  mockSaveAnswers: vi.fn(),
  mockSubmitQuiz: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockCaptureException: vi.fn(),
  mockDispatch: vi.fn(),
}));

vi.mock('@/api/quizzes.api', () => ({
  useGetQuizQuery: () => ({
    data: {
      id: 'quiz-1',
      sessionId: 'session-1',
      status: QuizStatus.IN_PROGRESS,
      questions: [{ id: 'q1', prompt: 'Question 1', options: ['A', 'B'], explanation: null }],
      answers: [{ questionId: 'q1', userAnswer: null, isCorrect: null, feedback: null, answeredAt: null }],
    },
    isLoading: false,
    error: null,
  }),
  useSaveAnswersMutation: () => [mockSaveAnswers],
  useSubmitQuizMutation: () => [mockSubmitQuiz, { isLoading: false }],
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));
vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
}));
vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));
vi.mock('@/components/quiz/QuestionCard', () => ({
  QuestionCard: ({ onAnswerChange }: { onAnswerChange: (id: string, answer: string) => void }) => (
    <button type="button" onClick={() => onAnswerChange('q1', 'A')}>
      Answer Q1
    </button>
  ),
}));
vi.mock('@/components/quiz/QuestionNav', () => ({
  QuestionNav: () => <div>Question Nav</div>,
}));
vi.mock('@/hooks/useApiError', () => ({
  parseApiError: () => ({ code: 'INTERNAL_SERVER_ERROR', message: 'error' }),
}));

import QuizTakingPage from './QuizTakingPage';

describe('QuizTakingPage telemetry catches (FE-011)', () => {
  beforeEach(() => {
    mockSaveAnswers.mockReset();
    mockSubmitQuiz.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockCaptureException.mockReset();
    mockDispatch.mockReset();
  });

  it('captures doSave autosave failures with stage metadata', async () => {
    const user = userEvent.setup();
    mockSaveAnswers.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('save failed')),
    });
    mockSubmitQuiz.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter initialEntries={['/quiz/quiz-1']}>
        <Routes>
          <Route path="/quiz/:id" element={<QuizTakingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /answer q1/i }));
    await user.click(screen.getByRole('button', { name: /complete quiz/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'saveAnswers',
          stage: 'doSave',
          quizId: 'quiz-1',
          sessionId: 'session-1',
        }),
      }),
    );
  });

  it('captures submit failures with submit stage metadata', async () => {
    const user = userEvent.setup();
    mockSaveAnswers.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ saved: 1 }),
    });
    mockSubmitQuiz.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('submit failed')),
    });

    render(
      <MemoryRouter initialEntries={['/quiz/quiz-1']}>
        <Routes>
          <Route path="/quiz/:id" element={<QuizTakingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /answer q1/i }));
    await user.click(screen.getByRole('button', { name: /complete quiz/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'submitQuiz',
          stage: 'submit',
          quizId: 'quiz-1',
          sessionId: 'session-1',
        }),
      }),
    );
  });

  it('does not capture Sentry exception for submit PARSING_ERROR when stream already started', async () => {
    const user = userEvent.setup();
    mockSaveAnswers.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ saved: 1 }),
    });
    mockSubmitQuiz.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({
        status: 'PARSING_ERROR',
        originalStatus: 200,
      }),
    });

    render(
      <MemoryRouter initialEntries={['/quiz/quiz-1']}>
        <Routes>
          <Route path="/quiz/:id" element={<QuizTakingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /answer q1/i }));
    await user.click(screen.getByRole('button', { name: /complete quiz/i }));

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Submitted your quiz!',
      'Sit tight - your answers are being graded.',
    );
    expect(mockShowError).not.toHaveBeenCalled();
  });
});
