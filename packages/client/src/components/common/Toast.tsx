import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { TOAST_DURATIONS, TOAST_EXIT_DELAY_MS } from './toast.constants';
import type { ToastVariant } from './toast.constants';
import styles from './Toast.module.css';

interface ToastProps {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  onDismiss: (id: string) => void;
}

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✓',
  warning: '!',
  error: '×',
};

const ARIA_ROLE_BY_VARIANT: Record<ToastVariant, 'status' | 'alert'> = {
  success: 'status',
  warning: 'alert',
  error: 'alert',
};

export const Toast = ({ id, variant, title, description, onDismiss }: ToastProps) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const dismissTimeoutRef = useRef<number | null>(null);
  const remainingMsRef = useRef(0);
  const startedAtMsRef = useRef(0);

  const durationMs = TOAST_DURATIONS[variant];

  const progressStyle = useMemo(
    () =>
      ({
        '--toast-duration-ms': `${durationMs}ms`,
        '--toast-play-state': isPaused ? 'paused' : 'running',
      }) as CSSProperties,
    [durationMs, isPaused],
  );

  const requestDismiss = (): void => {
    if (isExiting) return;
    if (dismissTimeoutRef.current !== null) {
      window.clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    setIsExiting(true);
  };

  const scheduleDismiss = (delayMs: number): void => {
    if (dismissTimeoutRef.current !== null) {
      window.clearTimeout(dismissTimeoutRef.current);
    }
    startedAtMsRef.current = Date.now();
    dismissTimeoutRef.current = window.setTimeout(() => {
      requestDismiss();
    }, delayMs);
  };

  useEffect(() => {
    remainingMsRef.current = durationMs;
    scheduleDismiss(durationMs);

    return () => {
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
    };
  }, [durationMs]);

  useEffect(() => {
    if (!isExiting) return;
    const exitTimeoutId = window.setTimeout(() => {
      onDismiss(id);
    }, TOAST_EXIT_DELAY_MS);

    return () => window.clearTimeout(exitTimeoutId);
  }, [id, isExiting, onDismiss]);

  const handleMouseEnter = (): void => {
    if (dismissTimeoutRef.current !== null) {
      window.clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
      const elapsedMs = Date.now() - startedAtMsRef.current;
      remainingMsRef.current = Math.max(remainingMsRef.current - elapsedMs, 0);
    }
    setIsPaused(true);
  };

  const handleMouseLeave = (): void => {
    if (!isExiting && remainingMsRef.current > 0) {
      scheduleDismiss(remainingMsRef.current);
    }
    setIsPaused(false);
  };

  return (
    <div
      className={`${styles.toast} ${styles[`variant_${variant}`]} ${isExiting ? styles.exiting : ''}`}
      role={ARIA_ROLE_BY_VARIANT[variant]}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={progressStyle}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.icon} aria-hidden>
            {VARIANT_ICON[variant]}
          </span>
          <p className={styles.title}>{title}</p>
        </div>
        <button
          className={styles.dismissButton}
          type="button"
          onClick={requestDismiss}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} />
      </div>
    </div>
  );
};
