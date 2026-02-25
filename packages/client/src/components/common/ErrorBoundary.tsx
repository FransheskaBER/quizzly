import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Sentry } from '@/config/sentry';
import { Button } from '@/components/common/Button';
import styles from './ErrorBoundary.module.css';

type Level = 'root' | 'route' | 'component';
type FallbackRender = (error: Error, resetError: () => void) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | FallbackRender;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level: Level;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
        tags: { error_boundary_level: this.props.level },
      });
    }
  }

  resetError() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return typeof this.props.fallback === 'function'
        ? this.props.fallback(this.state.error, this.resetError)
        : this.props.fallback;
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — Root: full-page fallback, wraps the entire app in main.tsx
// ---------------------------------------------------------------------------
export const RootErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary
    level="root"
    fallback={
      <div className={styles.rootFallback}>
        <h1 className={styles.rootTitle}>Something went wrong</h1>
        <p className={styles.rootMessage}>An unexpected error occurred.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

// ---------------------------------------------------------------------------
// Tier 2 — Route: error within layout, navbar still visible, used in App.tsx
// ---------------------------------------------------------------------------
export const RouteErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary
    level="route"
    fallback={
      <div className={styles.routeFallback}>
        <p className={styles.routeMessage}>Something went wrong on this page.</p>
        <Link to="/" className={styles.routeHomeLink}>
          Go to dashboard
        </Link>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

// ---------------------------------------------------------------------------
// Tier 3 — Component: inline fallback with retry, wraps isolated widgets
// ---------------------------------------------------------------------------
export const ComponentErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary
    level="component"
    fallback={(_error, resetError) => (
      <div className={styles.componentFallback}>
        <p className={styles.componentMessage}>Something went wrong.</p>
        <Button variant="secondary" size="sm" onClick={resetError}>
          Retry
        </Button>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);
