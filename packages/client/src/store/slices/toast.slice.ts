import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '@/store/store';
import { MAX_VISIBLE_TOASTS } from '@/components/common/toast.constants';
import type { ToastVariant } from '@/components/common/toast.constants';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: ToastItem[];
}

const initialState: ToastState = {
  toasts: [],
};

const enforceMaxVisibleToasts = (toasts: ToastItem[]): ToastItem[] => {
  if (toasts.length <= MAX_VISIBLE_TOASTS) return toasts;
  return toasts.slice(toasts.length - MAX_VISIBLE_TOASTS);
};

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: (state, action: PayloadAction<Omit<ToastItem, 'id'>>) => {
      const toastItem: ToastItem = {
        id: crypto.randomUUID(),
        ...action.payload,
      };
      state.toasts = enforceMaxVisibleToasts([...state.toasts, toastItem]);
    },
    dismissToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toastItem) => toastItem.id !== action.payload);
    },
  },
});

export const { addToast, dismissToast } = toastSlice.actions;
export const selectToasts = (state: RootState): ToastItem[] => state.toast.toasts;

export default toastSlice.reducer;
