import * as Sentry from '@sentry/react';

// Initialised once before ReactDOM.createRoot. When VITE_SENTRY_DSN is absent
// (local dev without DSN set), enabled=false makes all SDK calls no-ops.
export const initSentry = (): void => {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
    environment: import.meta.env.MODE,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
  });
};

export { Sentry };
