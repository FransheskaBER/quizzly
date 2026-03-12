import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToastContainer } from './ToastContainer';

const mockDispatch = vi.fn();
const mockUseAppSelector = vi.fn();

vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: unknown) => mockUseAppSelector(selector),
}));

vi.mock('@/store/slices/toast.slice', () => ({
  dismissToast: (id: string) => ({ type: 'toast/dismissToast', payload: id }),
  selectToasts: 'selectToasts',
}));

vi.mock('./Toast', () => ({
  Toast: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('ToastContainer', () => {
  it('renders notifications region with toasts from state', () => {
    mockUseAppSelector.mockReturnValue([
      { id: 'toast-1', variant: 'success', title: 'Saved', description: 'Done' },
      { id: 'toast-2', variant: 'error', title: 'Failed', description: 'Try again' },
    ]);

    render(<ToastContainer />);

    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders nothing when there are no toasts', () => {
    mockUseAppSelector.mockReturnValue([]);

    render(<ToastContainer />);

    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument();
  });
});
