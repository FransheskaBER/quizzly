import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShutdownManager } from '../process-shutdown.utils.js';

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('createShutdownManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes Sentry and exits non-zero for fatal shutdown', async () => {
    const logger = createLogger();
    const flushSentry = vi.fn().mockResolvedValue(true);
    const exitProcess = vi.fn();
    const server = { close: vi.fn((callback: () => void) => callback()) };

    const manager = createShutdownManager({
      logger,
      server,
      flushSentry,
      exitProcess,
      shutdownTimeoutMs: 10_000,
      sentryFlushTimeoutMs: 2_000,
    });

    manager.shutdown({ exitCode: 1, shouldFlushSentry: true });
    await Promise.resolve();

    expect(flushSentry).toHaveBeenCalledWith(2_000);
    expect(exitProcess).toHaveBeenCalledWith(1);
  });

  it('skips Sentry flush and exits zero for signal shutdown', async () => {
    const logger = createLogger();
    const flushSentry = vi.fn().mockResolvedValue(true);
    const exitProcess = vi.fn();
    const server = { close: vi.fn((callback: () => void) => callback()) };

    const manager = createShutdownManager({
      logger,
      server,
      flushSentry,
      exitProcess,
      shutdownTimeoutMs: 10_000,
      sentryFlushTimeoutMs: 2_000,
    });

    manager.shutdown({ signal: 'SIGTERM', exitCode: 0, shouldFlushSentry: false });
    await Promise.resolve();

    expect(flushSentry).not.toHaveBeenCalled();
    expect(exitProcess).toHaveBeenCalledWith(0);
  });

  it('ignores repeated shutdown calls after first invocation', async () => {
    const logger = createLogger();
    const flushSentry = vi.fn().mockResolvedValue(true);
    const exitProcess = vi.fn();
    const server = { close: vi.fn((callback: () => void) => callback()) };

    const manager = createShutdownManager({
      logger,
      server,
      flushSentry,
      exitProcess,
      shutdownTimeoutMs: 10_000,
      sentryFlushTimeoutMs: 2_000,
    });

    manager.shutdown({ exitCode: 1, shouldFlushSentry: true });
    manager.shutdown({ exitCode: 0, shouldFlushSentry: false, signal: 'SIGINT' });
    await Promise.resolve();

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exitProcess).toHaveBeenCalledTimes(1);
    expect(exitProcess).toHaveBeenCalledWith(1);
  });

  it('forces exit code 1 if server close hangs past timeout', () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const flushSentry = vi.fn().mockResolvedValue(true);
    const exitProcess = vi.fn();
    const server = { close: vi.fn(() => {}) };

    const manager = createShutdownManager({
      logger,
      server,
      flushSentry,
      exitProcess,
      shutdownTimeoutMs: 10_000,
      sentryFlushTimeoutMs: 2_000,
    });

    manager.shutdown({ signal: 'SIGTERM', exitCode: 0, shouldFlushSentry: false });
    vi.advanceTimersByTime(10_000);

    expect(exitProcess).toHaveBeenCalledWith(1);
  });
});
