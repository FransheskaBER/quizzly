import { useMemo } from 'react';

import { addToast } from '@/store/slices/toast.slice';
import { useAppDispatch } from '@/store/store';

interface UseToastReturn {
  showSuccess: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning: (title: string, description?: string) => void;
}

export const useToast = (): UseToastReturn => {
  const dispatch = useAppDispatch();

  return useMemo(
    () => ({
      showSuccess: (title: string, description?: string): void => {
        dispatch(addToast({ variant: 'success', title, description }));
      },
      showError: (title: string, description?: string): void => {
        dispatch(addToast({ variant: 'error', title, description }));
      },
      showWarning: (title: string, description?: string): void => {
        dispatch(addToast({ variant: 'warning', title, description }));
      },
    }),
    [dispatch],
  );
};
