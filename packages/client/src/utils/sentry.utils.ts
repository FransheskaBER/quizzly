/**
 * Normalizes unknown caught values into proper Error instances for Sentry.
 *
 * RTK Query catch blocks yield FetchBaseQueryError objects ({ status, data })
 * or wrappers ({ error: FetchBaseQueryError }) — not Error instances. Sentry
 * can't extract a meaningful message or stack trace from plain objects, so we
 * convert them here.
 */

type ObjectLike = Record<string, unknown>;

const isObjectLike = (value: unknown): value is ObjectLike =>
  typeof value === 'object' && value !== null;

/**
 * Attempts to pull a human-readable message from an RTK Query / backend error
 * shape. Checks `data.error.message`, `data.message`, then `message`.
 */
const extractErrorMessage = (value: unknown): string | undefined => {
  if (!isObjectLike(value)) return undefined;

  // Backend envelope: { data: { error: { message: '...' } } }
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

  // Direct message property
  if (typeof value.message === 'string') {
    return value.message;
  }

  return undefined;
};

/**
 * Converts an unknown caught value into an Error instance suitable for
 * `Sentry.captureException`.
 *
 * - If `err` is already an Error, returns it unchanged.
 * - If `err` wraps an Error at `.error`, returns that inner Error.
 * - Otherwise builds a new Error with a descriptive message extracted from the
 *   object (or the provided fallback) and attaches the original value as
 *   `originalError` for debug context.
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
