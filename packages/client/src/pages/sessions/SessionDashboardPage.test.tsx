import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SessionDetailResponse } from '@skills-trainer/shared';

// ---------------------------------------------------------------------------
// Mocks — must come before the component import
// ---------------------------------------------------------------------------

const {
  mockDispatch,
  mockUseAppSelector,
  mockShowError,
  mockShowSuccess,
  mockSubmitQuiz,
  mockUpdateSession,
  mockDeleteSession,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockUseAppSelector: vi.fn(() => []),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockSubmitQuiz: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockDeleteSession: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: mockUseAppSelector,
}));

vi.mock('@/store/api', () => ({
  api: {
    util: {
      invalidateTags: vi.fn(),
    },
  },
}));

vi.mock('@/api/auth.api', () => ({
  useGetMeQuery: vi.fn(),
}));

vi.mock('@/api/sessions.api', () => ({
  useGetSessionQuery: vi.fn(),
  useUpdateSessionMutation: vi.fn(() => [mockUpdateSession, { isLoading: false, error: null }]),
  useDeleteSessionMutation: vi.fn(() => [mockDeleteSession, { isLoading: false }]),
}));

vi.mock('@/api/quizzes.api', () => ({
  useSubmitQuizMutation: vi.fn(() => [mockSubmitQuiz]),
}));

vi.mock('@/hooks/useQuizGeneration', () => ({
  useQuizGeneration: vi.fn(() => ({
    generate: vi.fn(),
    status: 'idle',
    questions: [],
    quizAttemptId: null,
    error: null,
    totalExpected: 0,
    warning: null,
    progressMessage: null,
    reset: vi.fn(),
  })),
}));

// MaterialUploader makes API calls — stub it out to avoid network requests in tests.
vi.mock('@/components/session/MaterialUploader', () => ({
  MaterialUploader: () => <div data-testid="material-uploader" />,
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));
vi.mock('@/components/session/SessionForm', () => ({
  SessionForm: ({ onSubmit }: { onSubmit: (data: unknown) => Promise<void> }) => (
    <button type="button" onClick={() => void onSubmit({ name: 'Updated', subject: 'TS', goal: 'Learn' })}>
      Save Session Form
    </button>
  ),
}));
vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));

import { useGetMeQuery } from '@/api/auth.api';
import { useGetSessionQuery } from '@/api/sessions.api';
import SessionDashboardPage from './SessionDashboardPage';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  id: 'session-1',
  userId: 'user-1',
  name: 'Test Session',
  subject: 'TypeScript',
  goal: 'Learn types',
  createdAt: new Date().toISOString(),
  materials: [],
  quizAttempts: [],
} as unknown as SessionDetailResponse;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/sessions/session-1']}>
      <Routes>
        <Route path="/sessions/:id" element={<SessionDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );

// ---------------------------------------------------------------------------
// AC4 — post-delete (BYOK prompt) behavior
// ---------------------------------------------------------------------------

describe('SessionDashboardPage — Generate Quiz section (AC4)', () => {
  beforeEach(() => {
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockSubmitQuiz.mockReset();
    mockUpdateSession.mockReset();
    mockDeleteSession.mockReset();
    mockCaptureException.mockReset();
    mockUseAppSelector.mockReturnValue([]);
    localStorage.clear();

    vi.mocked(useGetSessionQuery).mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useGetSessionQuery>);
  });

  it('shows BYOK prompt linking to /profile when free trial used and no API key (AC4)', () => {
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: {
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        emailVerified: true,
        hasApiKey: false,
        hasUsedFreeTrial: true,
        createdAt: '',
      },
    } as unknown as ReturnType<typeof useGetMeQuery>);

    renderPage();

    expect(screen.getByText('To generate more quizzes, add your Anthropic key.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add api key/i })).toHaveAttribute('href', '/profile');
  });

  it('hides QuizPreferences when free trial used and no API key (AC4)', () => {
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: {
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        emailVerified: true,
        hasApiKey: false,
        hasUsedFreeTrial: true,
        createdAt: '',
      },
    } as unknown as ReturnType<typeof useGetMeQuery>);

    renderPage();

    // QuizPreferences renders a difficulty select — verify it's not present
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows QuizPreferences when free trial is not yet used', () => {
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: {
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        emailVerified: true,
        hasApiKey: false,
        hasUsedFreeTrial: false,
        createdAt: '',
      },
    } as unknown as ReturnType<typeof useGetMeQuery>);

    renderPage();

    expect(screen.queryByText(/to generate more quizzes/i)).not.toBeInTheDocument();
    // The Generate button from QuizPreferences should be present
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('shows QuizPreferences when free trial used AND API key is saved', () => {
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: {
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        emailVerified: true,
        hasApiKey: true,
        hasUsedFreeTrial: true,
        createdAt: '',
      },
    } as unknown as ReturnType<typeof useGetMeQuery>);

    renderPage();

    expect(screen.queryByText(/to generate more quizzes/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });
});

describe('SessionDashboardPage — telemetry catches (FE-001, FE-005)', () => {
  beforeEach(() => {
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockSubmitQuiz.mockReset();
    mockUpdateSession.mockReset();
    mockDeleteSession.mockReset();
    mockCaptureException.mockReset();
    mockUseAppSelector.mockReturnValue([]);
    localStorage.clear();

    const nowIso = new Date().toISOString();
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: {
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        emailVerified: true,
        hasApiKey: true,
        hasUsedFreeTrial: true,
        createdAt: '',
      },
    } as unknown as ReturnType<typeof useGetMeQuery>);

    vi.mocked(useGetSessionQuery).mockReturnValue({
      data: {
        ...MOCK_SESSION,
        quizAttempts: [{ id: 'qa-1', status: 'submitted_ungraded', createdAt: nowIso, questionCount: 1, score: null, difficulty: 'easy', answerFormat: 'multiple_choice', startedAt: null }],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useGetSessionQuery>);
  });

  it('captures localStorage parse failures with readViewedFeedbackIds context', () => {
    localStorage.setItem('quiz-feedback-viewed-ids', '{bad-json');
    renderPage();

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'readViewedFeedbackIds' }),
      }),
    );
  });

  it('captures retry submission failures with session and attempt metadata', async () => {
    const user = userEvent.setup();
    mockUseAppSelector.mockReturnValue([
      { quizAttemptId: 'qa-1', sessionId: 'session-1', message: 'Failed', createdAt: new Date().toISOString() },
    ]);
    mockSubmitQuiz.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('retry failed')),
    });

    renderPage();
    await user.click(screen.getByRole('button', { name: /retry submission/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'handleRetrySubmission',
          sessionId: 'session-1',
          quizAttemptId: 'qa-1',
        }),
      }),
    );
  });

  it('captures update failures with handleUpdateSession metadata', async () => {
    const user = userEvent.setup();
    mockUpdateSession.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('update failed')),
    });

    renderPage();
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /save session form/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'handleUpdateSession',
          sessionId: 'session-1',
        }),
      }),
    );
  });

  it('captures delete failures with handleDeleteSession metadata', async () => {
    const user = userEvent.setup();
    mockDeleteSession.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('delete failed')),
    });

    renderPage();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(screen.getByRole('button', { name: /delete session/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'handleDeleteSession',
          sessionId: 'session-1',
        }),
      }),
    );
  });
});
