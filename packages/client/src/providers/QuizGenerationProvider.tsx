import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useParams } from 'react-router-dom';

import { QuizStatus, type GenerateQuizQuery, type Question } from '@skills-trainer/shared';

import { api, API_BASE_URL } from '@/store/api';
import { authApi } from '@/api/auth.api';
import { useGetSessionQuery } from '@/api/sessions.api';
import { useGetQuizQuery } from '@/api/quizzes.api';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  generationStarted,
  generationAttemptCreated,
  questionsBatchReceived,
  generationCompleted,
  generationFailed,
  questionFailed,
  generationReset,
  selectQuizStream,
  type FailedSlot,
} from '@/store/slices/quizStream.slice';
import { useSSEStream } from '@/hooks/useSSEStream';
import type { GenericSSEEvent } from '@/hooks/useSSEStream';

type GenerationStatus = 'idle' | 'connecting' | 'generating' | 'complete' | 'error';

interface QuizGenerationContextValue {
  generate: (sessionId: string, preferences: GenerateQuizQuery) => void;
  status: GenerationStatus;
  questions: Question[];
  quizAttemptId: string | null;
  error: string | null;
  totalExpected: number;
  warning: string | null;
  progressMessage: string | null;
  failedSlots: FailedSlot[];
  reset: () => void;
  isGenerating: boolean;
}

const QuizGenerationContext = createContext<QuizGenerationContextValue | null>(null);

export const useQuizGenerationContext = (): QuizGenerationContextValue => {
  const ctx = useContext(QuizGenerationContext);
  if (!ctx) {
    throw new Error('useQuizGenerationContext must be used within a QuizGenerationProvider');
  }
  return ctx;
};

const QuizGenerationProviderInner = ({ children }: { children: ReactNode }) => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const dispatch = useAppDispatch();
  const quizStream = useAppSelector(selectQuizStream);

  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const questionBufferRef = useRef<Question[]>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalEventReceivedRef = useRef(false);

  const stopFlushInterval = useCallback((): void => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  }, []);

  const flushBuffer = useCallback((): void => {
    const pending = [...questionBufferRef.current];
    if (pending.length > 0) {
      questionBufferRef.current = [];
      dispatch(questionsBatchReceived(pending));
    }
  }, [dispatch]);

  const onEvent = useCallback((event: GenericSSEEvent): void => {
    if (event.type === 'progress' && typeof event.message === 'string') {
      const displayMessage = event.message === 'Analyzing materials...'
        ? 'Generating your quiz...'
        : event.message;
      setProgressMessage(displayMessage);
      return;
    }

    if (event.type === 'generation_started' && typeof event.data === 'object' && event.data !== null) {
      const { quizAttemptId } = event.data as { quizAttemptId: string };
      dispatch(generationAttemptCreated(quizAttemptId));
      return;
    }

    if (event.type === 'question' && typeof event.data === 'object' && event.data !== null) {
      questionBufferRef.current.push(event.data as Question);
      return;
    }

    if (event.type === 'question_failed' && typeof event.data === 'object' && event.data !== null) {
      const { questionNumber, message } = event.data as { questionNumber: number; message: string };
      dispatch(questionFailed({ questionNumber, message }));
      return;
    }

    if (event.type === 'complete' && typeof event.data === 'object' && event.data !== null) {
      const { quizAttemptId } = event.data as { quizAttemptId: string };
      terminalEventReceivedRef.current = true;
      flushBuffer();
      stopFlushInterval();
      dispatch(generationCompleted(quizAttemptId));
      if (sessionId) {
        dispatch(api.util.invalidateTags([
          { type: 'Session', id: sessionId },
          { type: 'Session', id: 'LIST' },
        ]));
      }
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      return;
    }

    if (event.type === 'error' && typeof event.message === 'string') {
      terminalEventReceivedRef.current = true;
      flushBuffer();
      stopFlushInterval();
      dispatch(generationFailed(event.message));
    }
  }, [dispatch, sessionId, flushBuffer, stopFlushInterval]);

  const onError = useCallback((message: string): void => {
    flushBuffer();
    stopFlushInterval();
    dispatch(generationFailed(message));
  }, [dispatch, flushBuffer, stopFlushInterval]);

  const onComplete = useCallback((): void => {
    stopFlushInterval();
    if (!terminalEventReceivedRef.current) {
      flushBuffer();
      dispatch(generationFailed('Connection closed unexpectedly. Please try again.'));
    }
  }, [dispatch, flushBuffer, stopFlushInterval]);

  const { start, close, warning } = useSSEStream({ onEvent, onError, onComplete });

  const closeRef = useRef(close);
  closeRef.current = close;

  // Page refresh resilience: check for in-progress generation on mount
  const { data: session } = useGetSessionQuery(sessionId ?? '', { skip: !sessionId });

  const generatingAttempt = session?.quizAttempts.find(
    (q) => q.status === QuizStatus.GENERATING,
  );

  // Fetch existing questions for a generating attempt (for reconnection)
  const { data: existingQuiz } = useGetQuizQuery(generatingAttempt?.id ?? '', {
    skip: !generatingAttempt,
  });

  const hasReconnectedRef = useRef(false);

  useEffect(() => {
    if (!generatingAttempt || !sessionId || hasReconnectedRef.current) return;
    if (quizStream.status !== 'idle') return;

    hasReconnectedRef.current = true;

    // Seed Redux with existing questions from DB
    if (existingQuiz && existingQuiz.questions.length > 0) {
      dispatch(generationStarted(generatingAttempt.questionCount));
      dispatch(questionsBatchReceived(existingQuiz.questions));
    } else {
      dispatch(generationStarted(generatingAttempt.questionCount));
    }

    // Reconnect to SSE stream for remaining questions
    const params = new URLSearchParams({
      reconnect: 'true',
      quizAttemptId: generatingAttempt.id,
    });

    questionBufferRef.current = [];
    terminalEventReceivedRef.current = false;
    flushIntervalRef.current = setInterval(() => flushBuffer(), 300);

    start(`${API_BASE_URL}/sessions/${sessionId}/quizzes/generate?${params.toString()}`);
  }, [generatingAttempt, sessionId, existingQuiz, quizStream.status, dispatch, start, flushBuffer]);

  // Reset reconnection tracking when sessionId changes
  useEffect(() => {
    hasReconnectedRef.current = false;
  }, [sessionId]);

  // Cleanup SSE connection and flush interval on unmount
  useEffect(() => {
    return () => {
      closeRef.current();
      stopFlushInterval();
    };
  }, [stopFlushInterval]);

  const generate = useCallback((sid: string, preferences: GenerateQuizQuery): void => {
    questionBufferRef.current = [];
    terminalEventReceivedRef.current = false;
    stopFlushInterval();
    setProgressMessage(null);
    dispatch(generationStarted(preferences.count));

    flushIntervalRef.current = setInterval(() => flushBuffer(), 300);

    const params = new URLSearchParams({
      difficulty: preferences.difficulty,
      format: preferences.format,
      count: String(preferences.count),
    });
    start(`${API_BASE_URL}/sessions/${sid}/quizzes/generate?${params.toString()}`);
  }, [dispatch, start, flushBuffer, stopFlushInterval]);

  const reset = useCallback((): void => {
    closeRef.current();
    stopFlushInterval();
    questionBufferRef.current = [];
    setProgressMessage(null);
    dispatch(generationReset());
  }, [dispatch, stopFlushInterval]);

  const value: QuizGenerationContextValue = {
    generate,
    status: quizStream.status,
    questions: quizStream.questions,
    quizAttemptId: quizStream.quizAttemptId,
    error: quizStream.error,
    totalExpected: quizStream.totalExpected,
    warning,
    progressMessage,
    failedSlots: quizStream.failedSlots,
    reset,
    isGenerating: quizStream.status === 'connecting' || quizStream.status === 'generating',
  };

  return (
    <QuizGenerationContext.Provider value={value}>
      {children}
    </QuizGenerationContext.Provider>
  );
};

/**
 * Wraps session-scoped routes to keep the SSE connection alive across
 * navigation between SessionDashboardPage and QuizTakingPage.
 * Renders <Outlet /> so child routes are rendered within the provider.
 */
const QuizGenerationProvider = () => (
  <QuizGenerationProviderInner>
    <Outlet />
  </QuizGenerationProviderInner>
);

export default QuizGenerationProvider;
