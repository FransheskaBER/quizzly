import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toast } from './Toast';
import { TOAST_EXIT_DELAY_MS } from './toast.constants';

describe('Toast', () => {
  it('renders title and description', () => {
    render(
      <Toast
        id="toast-1"
        variant="success"
        title="Saved your API key"
        description="All set."
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Saved your API key')).toBeInTheDocument();
    expect(screen.getByText('All set.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('uses alert role for warning and error variants', () => {
    const { rerender } = render(
      <Toast id="toast-2" variant="warning" title="Heads up" onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<Toast id="toast-3" variant="error" title="Failed" onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<Toast id="toast-dismiss" variant="error" title="Failed" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    vi.advanceTimersByTime(TOAST_EXIT_DELAY_MS);

    expect(onDismiss).toHaveBeenCalledWith('toast-dismiss');
    vi.useRealTimers();
  });
});
