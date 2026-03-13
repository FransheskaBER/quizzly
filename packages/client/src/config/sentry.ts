import * as Sentry from '@sentry/react';

// Initialised once before ReactDOM.createRoot. Sentry is enabled only when
// VITE_SENTRY_DSN is set and MODE is not 'test'; otherwise all SDK calls are no-ops.
export const initSentry = (): void => {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
    environment: import.meta.env.MODE,
    enabled: !!import.meta.env.VITE_SENTRY_DSN && !['test', 'development'].includes(import.meta.env.MODE),
  });
};

export { Sentry };
