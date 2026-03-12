type TimerHandle = ReturnType<typeof setTimeout>;

interface LoggerLike {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

interface ServerLike {
  close: (callback: () => void) => void;
}

export interface ShutdownRequest {
  signal?: NodeJS.Signals;
  exitCode: 0 | 1;
  shouldFlushSentry: boolean;
}

export interface ShutdownManagerOptions {
  logger: LoggerLike;
  server: ServerLike;
  flushSentry: (timeoutMs: number) => Promise<unknown>;
  exitProcess: (exitCode: number) => void;
  shutdownTimeoutMs: number;
  sentryFlushTimeoutMs: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export const createShutdownManager = (options: ShutdownManagerOptions) => {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let isShuttingDown = false;

  const shutdown = (request: ShutdownRequest): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    options.logger.info({ signal: request.signal }, 'Shutting down gracefully');

    const timeoutId: TimerHandle = setTimeoutFn(() => {
      options.logger.error(
        { signal: request.signal, timeoutMs: options.shutdownTimeoutMs },
        'Forced shutdown after timeout',
      );
      options.exitProcess(1);
    }, options.shutdownTimeoutMs);

    options.server.close(() => {
      clearTimeoutFn(timeoutId);
      void (async () => {
        if (request.shouldFlushSentry) {
          try {
            await options.flushSentry(options.sentryFlushTimeoutMs);
          } catch (err) {
            options.logger.warn({ err }, 'Failed to flush Sentry before exit');
          }
        }
        options.exitProcess(request.exitCode);
      })();
    });
  };

  return { shutdown };
};
