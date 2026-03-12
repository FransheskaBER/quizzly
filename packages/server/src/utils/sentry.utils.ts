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

export const captureExceptionOnce = (error: unknown, context?: CaptureContext): void => {
  if (isErrorCaptured(error)) return;
  Sentry.captureException(error, context);
  markErrorAsCaptured(error);
};
