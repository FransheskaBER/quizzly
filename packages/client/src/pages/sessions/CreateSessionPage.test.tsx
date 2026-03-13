import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockCreateSession, mockNavigate, mockShowError, mockShowSuccess, mockCaptureException } = vi.hoisted(() => ({
  mockCreateSession: vi.fn(),
  mockNavigate: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/api/sessions.api', () => ({
  useCreateSessionMutation: () => [mockCreateSession, { isLoading: false }],
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));
vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));
vi.mock('@/components/session/SessionForm', () => ({
  SessionForm: ({ onSubmit }: { onSubmit: (data: unknown) => Promise<void> }) => (
    <button type="button" onClick={() => void onSubmit({ name: 'Session', subject: 'TS', goal: 'Learn' })}>
      Submit Session
    </button>
  ),
}));

import CreateSessionPage from './CreateSessionPage';

describe('CreateSessionPage telemetry (FE-007)', () => {
  beforeEach(() => {
    mockCreateSession.mockReset();
    mockNavigate.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockCaptureException.mockReset();
  });

  it('captures createSession failures with operation metadata', async () => {
    const user = userEvent.setup();
    mockCreateSession.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('create failed')),
    });

    render(
      <MemoryRouter>
        <CreateSessionPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /submit session/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'createSession' }),
      }),
    );
  });
});
