import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const { mockLogout, mockButtonProps } = vi.hoisted(() => ({
  mockLogout: vi.fn(),
  mockButtonProps: vi.fn(),
}));

vi.mock('@/api/dashboard.api', () => ({
  useGetDashboardQuery: vi.fn(() => ({
    data: {
      username: 'Alex',
      totalSessions: 3,
      totalQuizzesCompleted: 8,
      averageScore: 72.5,
      mostPracticedSubject: 'TypeScript',
    },
    isLoading: false,
    error: null,
  })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock('@/components/common/Button', () => ({
  Button: (props: {
    to?: string;
    variant?: string;
    size?: string;
    onClick?: () => void;
    children: ReactNode;
  }) => {
    mockButtonProps(props);
    if (props.to) return <a href={props.to}>{props.children}</a>;
    return <button type="button" onClick={props.onClick}>{props.children}</button>;
  },
}));

import HomeDashboardPage from './HomeDashboardPage';

describe('HomeDashboardPage top bar actions', () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockButtonProps.mockReset();
  });

  it('uses ghost small Button actions for "Your API Key" and "Log out" (AC2)', () => {
    render(
      <MemoryRouter>
        <HomeDashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /your api key/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();

    expect(mockButtonProps).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/profile',
        variant: 'ghost',
        size: 'sm',
      }),
    );
    expect(mockButtonProps).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'ghost',
        size: 'sm',
      }),
    );
  });

  it('keeps log out behavior unchanged', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomeDashboardPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /log out/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
