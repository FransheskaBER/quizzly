import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));

import { ComponentErrorBoundary } from './ErrorBoundary';

const ThrowingComponent = () => {
  throw new Error('boom');
};

describe('ErrorBoundary telemetry (FE-012)', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
  });

  it('logs to console and captures to Sentry when boundary catches an error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ComponentErrorBoundary>
        <ThrowingComponent />
      </ComponentErrorBoundary>,
    );

    expect(consoleSpy).toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
