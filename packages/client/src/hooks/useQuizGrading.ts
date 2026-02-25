import { useRef, useEffect } from 'react';

import { api, API_BASE_URL } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  gradingStarted,
  questionGraded,
  gradingCompleted,
  gradingFailed,
  gradingReset,
  selectGradingStream,
} from '@/store/slices/quizStream.slice';
import type { GradedQuestion } from '@/store/slices/quizStream.slice';
import { useSSEStream } from '@/hooks/useSSEStream';
import type { GenericSSEEvent } from '@/hooks/useSSEStream';

export interface UseQuizGradingResult {
  regrade: () => void;
  gradingStatus: 'idle' | 'connecting' | 'grading' | 'complete' | 'error';
  gradedQuestions: GradedQuestion[];
  gradingError: string | null;
  finalScore: number | null;
  warning: string | null;
  reset: () => void;
}

/**
 * Composes useSSEStream to handle the POST /api/quizzes/:id/regrade SSE stream.
 * Used on the results page when status is 'submitted_ungraded'.
 *
 * Per-question events are dispatched to the quizStream Redux slice.
 * On 'complete', the results cache is invalidated so the UI re-fetches final data.
 * Resets the grading slice on unmount so the next visit starts fresh.
 */
export function useQuizGrading(quizAttemptId: string): UseQuizGradingResult {
  const dispatch = useAppDispatch();
  const { gradingStatus, gradedQuestions, gradingError, gradingFinalScore } =
    useAppSelector(selectGradingStream);
  const token = useAppSelector((state) => state.auth.token) ?? '';

  const gradedBufferRef = useRef<GradedQuestion[]>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalEventReceivedRef = useRef(false);

  const stopFlushInterval = (): void => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  };

  const flushBuffer = (): void => {
    const pending = [...gradedBufferRef.current];
    if (pending.length > 0) {
      gradedBufferRef.current = [];
      pending.forEach((q) => dispatch(questionGraded(q)));
    }
  };

  const onEvent = (event: GenericSSEEvent): void => {
    if (
      event.type === 'graded' &&
      typeof event.data === 'object' &&
      event.data !== null
    ) {
      const { questionId, score, isCorrect } = event.data as GradedQuestion;
      gradedBufferRef.current.push({ questionId, score, isCorrect });
      return;
    }

    if (
      event.type === 'complete' &&
      typeof event.data === 'object' &&
      event.data !== null
    ) {
      const { score } = event.data as { quizAttemptId: string; score: number };
      terminalEventReceivedRef.current = true;
      flushBuffer();
      stopFlushInterval();
      dispatch(gradingCompleted(score));
      // Invalidate so useGetResultsQuery re-fetches the final completed results.
      dispatch(api.util.invalidateTags([{ type: 'Quiz', id: `${quizAttemptId}-results` }]));
      dispatch(api.util.invalidateTags([{ type: 'Quiz', id: quizAttemptId }]));
      return;
    }

    if (event.type === 'error' && typeof event.message === 'string') {
      terminalEventReceivedRef.current = true;
      stopFlushInterval();
      dispatch(gradingFailed(event.message));
    }
  };

  const onError = (message: string): void => {
    stopFlushInterval();
    dispatch(gradingFailed(message));
  };

  const onComplete = (): void => {
    stopFlushInterval();
    if (!terminalEventReceivedRef.current) {
      flushBuffer();
      dispatch(gradingFailed('Connection closed unexpectedly. Please try again.'));
    }
  };

  const { start, close, warning } = useSSEStream({
    onEvent,
    onError,
    onComplete,
    token,
    fetchInit: { method: 'POST' },
  });

  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    return () => {
      closeRef.current();
      stopFlushInterval();
      dispatch(gradingReset());
    };
  }, [dispatch]);

  const regrade = (): void => {
    gradedBufferRef.current = [];
    terminalEventReceivedRef.current = false;
    stopFlushInterval();
    dispatch(gradingStarted());

    flushIntervalRef.current = setInterval(() => {
      flushBuffer();
    }, 300);

    start(`${API_BASE_URL}/quizzes/${quizAttemptId}/regrade`);
  };

  const reset = (): void => {
    closeRef.current();
    stopFlushInterval();
    gradedBufferRef.current = [];
    dispatch(gradingReset());
  };

  return {
    regrade,
    gradingStatus,
    gradedQuestions,
    gradingError,
    finalScore: gradingFinalScore,
    warning,
    reset,
  };
}
