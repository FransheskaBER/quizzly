import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useToast } from './useToast';

const mockDispatch = vi.fn();
const addToastMock = vi.fn((payload) => ({ type: 'toast/addToast', payload }));

vi.mock('@/store/store', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('@/store/slices/toast.slice', () => ({
  addToast: (payload: unknown) => addToastMock(payload),
}));

describe('useToast', () => {
  it('dispatches success toast payload', () => {
    const { result } = renderHook(() => useToast());

    result.current.showSuccess('Saved');

    expect(addToastMock).toHaveBeenCalledWith({
      variant: 'success',
      title: 'Saved',
      description: undefined,
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'toast/addToast',
      payload: {
        variant: 'success',
        title: 'Saved',
        description: undefined,
      },
    });
  });

  it('dispatches error and warning variants', () => {
    const { result } = renderHook(() => useToast());

    result.current.showError('Error title', 'Error description');
    result.current.showWarning('Warning title', 'Warning description');

    expect(addToastMock).toHaveBeenCalledWith({
      variant: 'error',
      title: 'Error title',
      description: 'Error description',
    });
    expect(addToastMock).toHaveBeenCalledWith({
      variant: 'warning',
      title: 'Warning title',
      description: 'Warning description',
    });
  });
});
