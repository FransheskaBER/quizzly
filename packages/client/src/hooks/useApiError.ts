import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';

interface ApiErrorResult {
  code: string | null;
  message: string;
  fieldErrors: Record<string, string> | null;
}

interface BackendErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

const isFetchBaseQueryError = (err: unknown): err is FetchBaseQueryError =>
  typeof err === 'object' && err !== null && 'status' in err;

const isBackendErrorBody = (data: unknown): data is BackendErrorBody =>
  typeof data === 'object' &&
  data !== null &&
  'error' in data &&
  typeof (data as BackendErrorBody).error?.message === 'string';

/**
 * Extracts structured error info from any RTK Query error shape.
 * Call this in catch blocks after a .unwrap() call throws.
 *
 * Returns { code, message, fieldErrors } where:
 * - code:        backend error code (e.g. 'EMAIL_NOT_VERIFIED') or null
 * - message:     human-readable message ready to display
 * - fieldErrors: map of field path → message for form-level errors, or null
 */
export const useApiError = (error: unknown): ApiErrorResult => {
  if (!error) return { code: null, message: '', fieldErrors: null };

  if (isFetchBaseQueryError(error)) {
    if (isBackendErrorBody(error.data)) {
      const { code, message, details } = error.data.error;
      const fieldErrors = details
        ? details.reduce<Record<string, string>>((acc, { field, message: msg }) => {
            acc[field] = msg;
            return acc;
          }, {})
        : null;
      return { code, message, fieldErrors };
    }

    if (error.status === 'FETCH_ERROR') {
      return {
        code: null,
        message: 'Network error. Please check your connection.',
        fieldErrors: null,
      };
    }

    return { code: null, message: 'An unexpected error occurred.', fieldErrors: null };
  }

  // SerializedError
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as SerializedError).message;
    return { code: null, message: msg ?? 'An unexpected error occurred.', fieldErrors: null };
  }

  return { code: null, message: 'An unexpected error occurred.', fieldErrors: null };
};
