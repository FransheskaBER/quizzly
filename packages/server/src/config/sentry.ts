import * as Sentry from '@sentry/node';

import { env } from './env.js';

// Initialise Sentry once at startup. When SENTRY_DSN is absent (local dev,
// CI, test) enabled=false makes every SDK call a no-op — no crash, no noise.
Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  enabled: !!env.SENTRY_DSN && !['test', 'development'].includes(env.NODE_ENV),
  sendDefaultPii: true,
});

export { Sentry };
