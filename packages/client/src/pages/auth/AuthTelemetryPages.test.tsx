import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const {
  mockSignup,
  mockForgotPassword,
  mockResetPassword,
  mockLogin,
  mockResendVerification,
  mockShowError,
  mockShowSuccess,
  mockCaptureException,
  mockParseApiError,
} = vi.hoisted(() => ({
  mockSignup: vi.fn(),
  mockForgotPassword: vi.fn(),
  mockResetPassword: vi.fn(),
  mockLogin: vi.fn(),
  mockResendVerification: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockCaptureException: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock accepts error arg for type compatibility
  mockParseApiError: vi.fn((err?: unknown) => ({ code: 'INTERNAL_SERVER_ERROR', message: 'failure' })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    signup: mockSignup,
    forgotPassword: mockForgotPassword,
    resetPassword: mockResetPassword,
    login: mockLogin,
    resendVerification: mockResendVerification,
  }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));
vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));
vi.mock('@/hooks/useApiError', () => ({
  parseApiError: (error: unknown) => (mockParseApiError as (err: unknown) => ReturnType<typeof mockParseApiError>)(error),
}));

import SignupPage from './SignupPage';
import ResetPasswordPage from './ResetPasswordPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import LoginPage from './LoginPage';

describe('Auth page telemetry catches (FE-009)', () => {
  beforeEach(() => {
    mockSignup.mockReset();
    mockForgotPassword.mockReset();
    mockResetPassword.mockReset();
    mockLogin.mockReset();
    mockResendVerification.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockCaptureException.mockReset();
    mockParseApiError.mockReset();
    mockParseApiError.mockReturnValue({ code: 'INTERNAL_SERVER_ERROR', message: 'failure' });
  });

  it('captures signup failures with signup operation metadata', async () => {
    const user = userEvent.setup();
    mockSignup.mockRejectedValue(new Error('signup failed'));

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^username$/i), 'alice');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'signup',
          email: 'user@example.com',
        }),
      }),
    );
  });

  it('captures forgot-password failures with forgotPassword operation metadata', async () => {
    const user = userEvent.setup();
    mockForgotPassword.mockRejectedValue(new Error('forgot failed'));

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'forgotPassword',
          email: 'user@example.com',
        }),
      }),
    );
  });

  it('captures reset-password failures with resetPassword operation metadata', async () => {
    const user = userEvent.setup();
    mockResetPassword.mockRejectedValue(new Error('reset failed'));

    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc123']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^new password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'resetPassword',
          hasToken: true,
        }),
      }),
    );
  });

  it('captures login failures with login operation metadata', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error('login failed'));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          operation: 'login',
          email: 'user@example.com',
        }),
      }),
    );
  });
});
