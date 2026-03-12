import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SessionDetailResponse } from '@skills-trainer/shared';

// ---------------------------------------------------------------------------
// Mocks — must come before the component import
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();

vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(() => []),
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
  useUpdateSessionMutation: vi.fn(() => [vi.fn(), { isLoading: false, error: null }]),
  useDeleteSessionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock('@/api/quizzes.api', () => ({
  useSubmitQuizMutation: vi.fn(() => [vi.fn()]),
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

    expect(screen.getByText(/to generate more quizzes/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile');
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
