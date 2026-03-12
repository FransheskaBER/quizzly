export const TOAST_VARIANTS = ['success', 'warning', 'error'] as const;

export type ToastVariant = (typeof TOAST_VARIANTS)[number];

/** Max toasts visible at once. Oldest evicted when exceeded. */
export const MAX_VISIBLE_TOASTS = 3;

/** Auto-dismiss durations in milliseconds, keyed by variant. */
export const TOAST_DURATIONS: Record<ToastVariant, number> = {
  success: 3_000,
  warning: 5_000,
  error: 6_000,
};

/** z-index for the toast container. Must sit above Modal (1000). */
export const TOAST_Z_INDEX = 1100;

/** Offset from viewport edges in pixels. */
export const TOAST_VIEWPORT_OFFSET = 16;

/** Gap between stacked toasts in pixels. */
export const TOAST_GAP = 12;

/** HTTP status codes treated as transient (short wait message). */
export const TRANSIENT_STATUS_CODES: ReadonlySet<number> = new Set([502, 503]);

/** Delay before removing after exit animation starts. */
export const TOAST_EXIT_DELAY_MS = 250;
