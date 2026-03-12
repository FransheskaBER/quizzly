import { describe, expect, it, vi } from 'vitest';

import toastReducer, { addToast, dismissToast } from './toast.slice';

const TOAST_ID_ONE = '11111111-1111-1111-1111-111111111111';
const TOAST_ID_TWO = '22222222-2222-2222-2222-222222222222';
const TOAST_ID_THREE = '33333333-3333-3333-3333-333333333333';
const TOAST_ID_FOUR = '44444444-4444-4444-4444-444444444444';

describe('toast.slice', () => {
  it('adds a toast with a generated id', () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(TOAST_ID_ONE);

    const state = toastReducer(undefined, addToast({ variant: 'success', title: 'Saved' }));

    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0]).toEqual({
      id: TOAST_ID_ONE,
      variant: 'success',
      title: 'Saved',
      description: undefined,
    });

    randomUuidSpy.mockRestore();
  });

  it('evicts the oldest toast when capacity is exceeded', () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID');
    randomUuidSpy
      .mockReturnValueOnce(TOAST_ID_ONE)
      .mockReturnValueOnce(TOAST_ID_TWO)
      .mockReturnValueOnce(TOAST_ID_THREE)
      .mockReturnValueOnce(TOAST_ID_FOUR);

    let state = toastReducer(undefined, addToast({ variant: 'success', title: 'One' }));
    state = toastReducer(state, addToast({ variant: 'warning', title: 'Two' }));
    state = toastReducer(state, addToast({ variant: 'error', title: 'Three' }));
    state = toastReducer(state, addToast({ variant: 'success', title: 'Four' }));

    expect(state.toasts.map((toastItem) => toastItem.id)).toEqual([TOAST_ID_TWO, TOAST_ID_THREE, TOAST_ID_FOUR]);

    randomUuidSpy.mockRestore();
  });

  it('dismisses a toast by id', () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID');
    randomUuidSpy.mockReturnValueOnce(TOAST_ID_ONE).mockReturnValueOnce(TOAST_ID_TWO);

    let state = toastReducer(undefined, addToast({ variant: 'success', title: 'One' }));
    state = toastReducer(state, addToast({ variant: 'warning', title: 'Two' }));
    state = toastReducer(state, dismissToast(TOAST_ID_ONE));

    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe(TOAST_ID_TWO);

    randomUuidSpy.mockRestore();
  });
});
