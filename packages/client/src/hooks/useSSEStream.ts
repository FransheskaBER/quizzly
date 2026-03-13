import { useState, useRef, useEffect } from 'react';

import { SSE_CLIENT_WARNING_TIMEOUT_MS } from '@skills-trainer/shared';
import { Sentry } from '@/config/sentry';

export interface GenericSSEEvent {
  type: string;
  data?: unknown;
  message?: string;
}

interface UseSSEStreamOptions {
  onEvent: (event: GenericSSEEvent) => void;
  onError: (message: string) => void;
  onComplete: () => void;
  /** Optional fetch overrides (e.g. method: 'POST', body: '...'). Headers and signal are managed internally. */
  fetchInit?: Omit<RequestInit, 'headers' | 'signal' | 'credentials'>;
}

export interface UseSSEStreamResult {
  start: (url: string) => void;
  close: () => void;
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';
  warning: string | null;
}

interface BackendErrorShape {
  error: { message: string };
}

const isBackendError = (data: unknown): data is BackendErrorShape =>
  typeof data === 'object' &&
  data !== null &&
  'error' in data &&
  typeof (data as BackendErrorShape).error?.message === 'string';

type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';
const SSE_EVENT_CHUNK_PREVIEW_MAX_CHARS = 120;

/**
 * Generic SSE hook backed by fetch + ReadableStream.
 * Uses fetch (not EventSource) because EventSource cannot set credentials.
 * Auth: sends httpOnly session cookie via credentials: 'include'.
 *
 * No auto-reconnect — on error or disconnect, status moves to 'error' and
 * the caller is responsible for displaying a manual-retry UI.
 */
export function useSSEStream(options: UseSSEStreamOptions): UseSSEStreamResult {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [warning, setWarning] = useState<string | null>(null);

  // Keep callbacks in refs so the async stream always calls the latest version
  // without needing to abort and restart the connection on each render.
  const onEventRef = useRef(options.onEvent);
  const onErrorRef = useRef(options.onError);
  const onCompleteRef = useRef(options.onComplete);
  const fetchInitRef = useRef(options.fetchInit);

  onEventRef.current = options.onEvent;
  onErrorRef.current = options.onError;
  onCompleteRef.current = options.onComplete;
  fetchInitRef.current = options.fetchInit;

  const abortControllerRef = useRef<AbortController | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, []);

  const close = (): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = null;
  };

  const start = (url: string): void => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStatus('connecting');
    setWarning(null);

    void (async () => {
      // Schedules (or resets) the 30-second no-event warning timer.
      const scheduleWarning = (): void => {
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => {
          setWarning('Generation is taking longer than expected...');
        }, SSE_CLIENT_WARNING_TIMEOUT_MS);
      };

      try {
        const response = await fetch(url, {
          ...fetchInitRef.current,
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json() as unknown;
          const message = isBackendError(data)
            ? data.error.message
            : 'Generation failed. Please try again.';
          onErrorRef.current(message);
          setStatus('error');
          return;
        }

        if (!response.body) {
          onErrorRef.current('No response body received.');
          setStatus('error');
          return;
        }

        setStatus('streaming');
        scheduleWarning();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let reading = true;
        while (reading) {
          const { done, value } = await reader.read();

          if (done) {
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
            onCompleteRef.current();
            setStatus('complete');
            reading = false;
          } else {
            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by double newlines. Split and keep any
            // incomplete trailing chunk in the buffer for the next read.
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
              const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
              if (!dataLine) continue;

              try {
                const event = JSON.parse(dataLine.slice(6)) as GenericSSEEvent;
                // Receiving any event resets the no-event warning timer.
                scheduleWarning();
                setWarning(null);
                onEventRef.current(event);
              } catch (err) {
                const context = {
                  operation: 'parseSseEvent',
                  url,
                  eventChunkLength: part.length,
                  eventChunkPreview: part.slice(0, SSE_EVENT_CHUNK_PREVIEW_MAX_CHARS),
                };
                // eslint-disable-next-line no-console
                console.error('Failed to parse SSE event payload', err, context);
                Sentry.captureException(err, { extra: context });
              }
            }
          }
        }
      } catch (err) {
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Intentional close via close() or component unmount — not an error.
          return;
        }
        const context = {
          operation: 'startSseStream',
          url,
          method: fetchInitRef.current?.method ?? 'GET',
        };
        // eslint-disable-next-line no-console
        console.error('SSE stream failed', err, context);
        Sentry.captureException(err, { extra: context });
        onErrorRef.current('Connection failed. Please check your connection and try again.');
        setStatus('error');
      }
    })();
  };

  return { start, close, status, warning };
}
