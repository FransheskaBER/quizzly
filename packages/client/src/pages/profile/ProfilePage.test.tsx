import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mocks — must come before the component import
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();

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

const mockSaveApiKey = vi.fn();
const mockDeleteApiKey = vi.fn();
const mockUpdateProfile = vi.fn();
const mockChangePassword = vi.fn();

vi.mock('@/api/user.api', () => ({
  useGetApiKeyStatusQuery: vi.fn(),
  useSaveApiKeyMutation: vi.fn(() => [mockSaveApiKey, { isLoading: false }]),
  useDeleteApiKeyMutation: vi.fn(() => [mockDeleteApiKey, { isLoading: false }]),
  useUpdateProfileMutation: vi.fn(() => [mockUpdateProfile, { isLoading: false }]),
  useChangePasswordMutation: vi.fn(() => [mockChangePassword, { isLoading: false }]),
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
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: { id: 'u1', email: 'a@b.com', username: 'alice', emailVerified: true, hasApiKey: false, hasUsedFreeTrial: false, createdAt: '' },
    } as unknown as ReturnType<typeof useGetMeQuery>);
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

// ---------------------------------------------------------------------------
// AC7 — Username section dispatches refetch after profile update
// ---------------------------------------------------------------------------

describe('ProfilePage — Username section (AC7)', () => {
  it('renders username field with current username', () => {
    vi.mocked(useGetMeQuery).mockReturnValue({
      data: { id: 'u1', email: 'a@b.com', username: 'alice', emailVerified: true, hasApiKey: false, hasUsedFreeTrial: false, createdAt: '' },
    } as unknown as ReturnType<typeof useGetMeQuery>);
    vi.mocked(useGetApiKeyStatusQuery).mockReturnValue({
      data: { hasApiKey: false, hint: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetApiKeyStatusQuery>);

    renderPage();

    const usernameInput = screen.getByLabelText(/username/i);
    expect(usernameInput).toHaveValue('alice');
  });
});
