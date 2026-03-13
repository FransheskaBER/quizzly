import { Sentry } from '../config/sentry.js';

const SENTRY_CAPTURED_KEY = Symbol.for('quizzly.sentryCaptured');

type CaptureContext = Parameters<typeof Sentry.captureException>[1];

const isObjectLike = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

export const markErrorAsCaptured = (error: unknown): void => {
  if (!isObjectLike(error)) return;
  error[SENTRY_CAPTURED_KEY] = true;
};

export const isErrorCaptured = (error: unknown): boolean => {
  if (!isObjectLike(error)) return false;
  return error[SENTRY_CAPTURED_KEY] === true;
};

/**
 * Attempts to pull a human-readable message from an object.
 * Checks `data.error.message`, `data.message`, then `message`.
 */
const extractErrorMessage = (value: unknown): string | undefined => {
  if (!isObjectLike(value)) return undefined;

  const data = value.data;
  if (isObjectLike(data)) {
    const nested = data.error;
    if (isObjectLike(nested) && typeof nested.message === 'string') {
      return nested.message;
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
  }

  if (typeof value.message === 'string') {
    return value.message;
  }

  return undefined;
};

/**
 * Converts an unknown caught value into an Error instance suitable for
 * `Sentry.captureException`. If `err` is already an Error, returns it
 * unchanged. Otherwise builds a new Error with a descriptive message and
 * attaches the original value as `originalError` for debug context.
 */
export function toSentryError(err: unknown, fallbackMessage: string): Error {
  if (err instanceof Error) return err;

  const inner = isObjectLike(err) ? err.error : undefined;
  if (inner instanceof Error) return inner;

  const message = extractErrorMessage(err) ?? extractErrorMessage(inner) ?? fallbackMessage;
  const sentryError = new Error(message);
  (sentryError as Error & { originalError?: unknown }).originalError = err;
  return sentryError;
}

export const captureExceptionOnce = (error: unknown, context?: CaptureContext): void => {
  if (isErrorCaptured(error)) return;
  const normalized = toSentryError(error, 'Unknown error');
  if (normalized !== error && context && typeof context === 'object' && !('scopeToUse' in context)) {
    const hint = context as Record<string, unknown>;
    const existingExtra = (hint.extra as Record<string, unknown> | undefined) ?? {};
    hint.extra = { ...existingExtra, originalError: error };
  }
  Sentry.captureException(normalized, context);
  markErrorAsCaptured(error);
};
