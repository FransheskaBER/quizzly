import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mocks — must come before the component import
// ---------------------------------------------------------------------------

const { mockDispatch, mockShowError, mockShowSuccess, mockCaptureException } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(),
}));

vi.mock('@/api/auth.api', () => ({
  useGetMeQuery: vi.fn(),
  authApi: {
    endpoints: {
      getMe: {
        initiate: vi.fn(() => ({ type: 'mock-initiate' })),
      },
    },
  },
}));

const { mockSaveApiKey, mockDeleteApiKey } = vi.hoisted(() => ({
  mockSaveApiKey: vi.fn(),
  mockDeleteApiKey: vi.fn(),
}));

vi.mock('@/api/user.api', () => ({
  useGetApiKeyStatusQuery: vi.fn(),
  useSaveApiKeyMutation: vi.fn(() => [mockSaveApiKey, { isLoading: false }]),
  useDeleteApiKeyMutation: vi.fn(() => [mockDeleteApiKey, { isLoading: false }]),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));
vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));

import { useGetMeQuery } from '@/api/auth.api';
import { useGetApiKeyStatusQuery } from '@/api/user.api';
import ProfilePage from './ProfilePage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );

// ---------------------------------------------------------------------------
// AC3 — API Key section masking
// ---------------------------------------------------------------------------

describe('ProfilePage — API Key section (AC3)', () => {
  beforeEach(() => {
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockCaptureException.mockReset();
    mockSaveApiKey.mockReset();
    mockDeleteApiKey.mockReset();

    vi.mocked(useGetMeQuery).mockReturnValue({
      data: { id: 'u1', email: 'a@b.com', username: 'alice', emailVerified: true, hasApiKey: false, hasUsedFreeTrial: false, createdAt: '' },
    } as unknown as ReturnType<typeof useGetMeQuery>);
  });

  it('renders "Your API Key" heading and omits legacy Username/Password sections (AC1)', () => {
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: false, hint: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);

    renderPage();

    expect(screen.getByRole('heading', { name: /your api key/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /username/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /password/i })).not.toBeInTheDocument();
  });

  it('shows the save-key form (input + Save Key button) when no key is saved', () => {
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: false, hint: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);

    renderPage();

    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save key/i })).toBeInTheDocument();
  });

  it('shows the masked hint and Remove button when a key is saved (AC3)', () => {
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: true, hint: 'sk-ant-...ef12' },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);

    renderPage();

    expect(screen.getByText('sk-ant-...ef12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('never renders a full-value API key input when a key is already saved (AC3)', () => {
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: true, hint: 'sk-ant-...ef12' },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);

    renderPage();

    // The key input form (Save Key button) should not be present
    expect(screen.queryByRole('button', { name: /save key/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it('does not render the key input section while status is loading', () => {
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);

    renderPage();

    expect(screen.queryByRole('button', { name: /save key/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

describe('ProfilePage — telemetry catches (FE-006)', () => {
  beforeEach(() => {
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockCaptureException.mockReset();
    mockSaveApiKey.mockReset();
    mockDeleteApiKey.mockReset();

    vi.mocked(useGetMeQuery).mockReturnValue({
      data: { id: 'u1', email: 'a@b.com', username: 'alice', emailVerified: true, hasApiKey: false, hasUsedFreeTrial: false, createdAt: '' },
    } as unknown as ReturnType<typeof useGetMeQuery>);
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: false, hint: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);
  });

  it('captures save API key errors with saveApiKey metadata', async () => {
    const user = userEvent.setup();
    mockSaveApiKey.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('save key failed')),
    });

    renderPage();
    await user.type(screen.getByLabelText(/^api key$/i), 'sk-ant-valid-key-1234567890');
    await user.click(screen.getByRole('button', { name: /save key/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'saveApiKey' }),
      }),
    );
  });

  it('captures delete API key errors with deleteApiKey metadata', async () => {
    const user = userEvent.setup();
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: true, hint: 'sk-ant-...ef12' },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);
    mockDeleteApiKey.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('delete key failed')),
    });

    renderPage();
    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await user.click(screen.getByRole('button', { name: /confirm remove/i }));

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'deleteApiKey' }),
      }),
    );
  });
});
