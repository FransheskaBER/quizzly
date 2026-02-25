import { useState, useRef, useEffect } from 'react';

import type { GenerateQuizQuery, Question } from '@skills-trainer/shared';

import { api, API_BASE_URL } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  generationStarted,
  questionsBatchReceived,
  generationCompleted,
  generationFailed,
  generationReset,
  selectQuizStream,
} from '@/store/slices/quizStream.slice';
import { useSSEStream } from '@/hooks/useSSEStream';
import type { GenericSSEEvent } from '@/hooks/useSSEStream';

export interface UseQuizGenerationResult {
  generate: (preferences: GenerateQuizQuery) => void;
  status: 'idle' | 'connecting' | 'generating' | 'complete' | 'error';
  questions: Question[];
  quizAttemptId: string | null;
  error: string | null;
  totalExpected: number;
  warning: string | null;
  progressMessage: string | null;
  reset: () => void;
}

/**
 * Composes useSSEStream with the quizStream Redux slice.
 * Components call generate() to start generation and read status/questions from
 * the returned values (which come from the Redux store).
 *
 * Batching: question events are buffered in a ref and flushed to Redux every
 * 300ms (or immediately on 'complete') to avoid per-event dispatches.
 *
 * Cleanup: the SSE connection closes and the Redux slice resets on unmount so
 * returning to the page always shows a fresh preferences form.
 */
export function useQuizGeneration(sessionId: string): UseQuizGenerationResult {
  const dispatch = useAppDispatch();
  const quizStream = useAppSelector(selectQuizStream);
  const token = useAppSelector((state) => state.auth.token) ?? '';

  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const questionBufferRef = useRef<Question[]>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set to true when a 'complete' or SSE 'error' event is received. Checked in
  // onComplete to detect unexpected stream closure (done=true with no terminal event).
  const terminalEventReceivedRef = useRef(false);

  const stopFlushInterval = (): void => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  };

  const flushBuffer = (): void => {
    const pending = [...questionBufferRef.current];
    if (pending.length > 0) {
      questionBufferRef.current = [];
      dispatch(questionsBatchReceived(pending));
    }
  };

  const onEvent = (event: GenericSSEEvent): void => {
    if (event.type === 'progress' && typeof event.message === 'string') {
      // Progress messages are high-frequency local state — not stored in Redux.
      setProgressMessage(event.message);
      return;
    }

    if (event.type === 'question' && typeof event.data === 'object' && event.data !== null) {
      questionBufferRef.current.push(event.data as Question);
      return;
    }

    if (event.type === 'complete' && typeof event.data === 'object' && event.data !== null) {
      const { quizAttemptId } = event.data as { quizAttemptId: string };
      terminalEventReceivedRef.current = true;
      flushBuffer();
      stopFlushInterval();
      dispatch(generationCompleted(quizAttemptId));
      // Refresh the session detail and list so the new quiz attempt appears.
      dispatch(api.util.invalidateTags([{ type: 'Session', id: sessionId }, { type: 'Session', id: 'LIST' }]));
      return;
    }

    if (event.type === 'error' && typeof event.message === 'string') {
      terminalEventReceivedRef.current = true;
      flushBuffer();
      stopFlushInterval();
      dispatch(generationFailed(event.message));
    }
  };

  const onError = (message: string): void => {
    stopFlushInterval();
    dispatch(generationFailed(message));
  };

  // Stream closure (done = true) without a prior terminal SSE event means the
  // connection dropped unexpectedly. Move to error state so the user can retry.
  const onComplete = (): void => {
    stopFlushInterval();
    if (!terminalEventReceivedRef.current) {
      flushBuffer();
      dispatch(generationFailed('Connection closed unexpectedly. Please try again.'));
    }
  };

  const { start, close, warning } = useSSEStream({ onEvent, onError, onComplete, token });

  // Keep close in a ref so the unmount effect always calls the latest version.
  const closeRef = useRef(close);
  closeRef.current = close;

  // On unmount: close the SSE connection and reset the Redux slice so returning
  // to the session page shows a fresh preferences form, not stale progress.
  useEffect(() => {
    return () => {
      closeRef.current();
      stopFlushInterval();
      dispatch(generationReset());
    };
  }, [dispatch]);

  const generate = (preferences: GenerateQuizQuery): void => {
    questionBufferRef.current = [];
    terminalEventReceivedRef.current = false;
    stopFlushInterval();
    setProgressMessage(null);
    dispatch(generationStarted(preferences.count));

    flushIntervalRef.current = setInterval(() => {
      flushBuffer();
    }, 300);

    const params = new URLSearchParams({
      difficulty: preferences.difficulty,
      format: preferences.format,
      count: String(preferences.count),
    });
    start(`${API_BASE_URL}/sessions/${sessionId}/quizzes/generate?${params.toString()}`);
  };

  const reset = (): void => {
    closeRef.current();
    stopFlushInterval();
    questionBufferRef.current = [];
    setProgressMessage(null);
    dispatch(generationReset());
  };

  return {
    generate,
    status: quizStream.status,
    questions: quizStream.questions,
    quizAttemptId: quizStream.quizAttemptId,
    error: quizStream.error,
    totalExpected: quizStream.totalExpected,
    warning,
    progressMessage,
    reset,
  };
}
