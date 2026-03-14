import { lazy } from 'react';
import type { ComponentType } from 'react';

const SESSION_KEY_PREFIX = 'lazy_reload:';

/**
 * Detects errors caused by stale chunk/CSS references after a new deployment.
 * Vite hashes assets by content — after deploy, old hashes return 404.
 */
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('unable to preload css') ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk')
  );
}

/**
 * Wraps React.lazy() with a single-retry reload for stale deployment assets.
 *
 * On chunk/CSS load failure:
 * 1. Checks sessionStorage to see if we already reloaded for this path.
 * 2. If not, sets a flag and reloads the page (fetches fresh index.html).
 * 3. If already reloaded once, re-throws so the error boundary handles it.
 *
 * This prevents infinite reload loops while recovering from most deploy mismatches.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(() =>
    importFn().catch((error: unknown) => {
      if (!isChunkLoadError(error)) throw error;

      const key = SESSION_KEY_PREFIX + window.location.pathname;
      const hasReloaded = sessionStorage.getItem(key);

      if (!hasReloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render stale state
        return new Promise<{ default: T }>(() => {});
      }

      // Already reloaded once — clear the flag and let the error boundary handle it
      sessionStorage.removeItem(key);
      throw error;
    })
  );
}
