import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { QuizStatus } from '@skills-trainer/shared';

import { useGetQuizQuery, useSaveAnswersMutation, useSubmitQuizMutation } from '@/api/quizzes.api';
import { parseApiError } from '@/hooks/useApiError';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ComponentErrorBoundary } from '@/components/common/ErrorBoundary';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { QuestionNav } from '@/components/quiz/QuestionNav';
import { api } from '@/store/api';
import { useAppDispatch } from '@/store/store';
import { submitFailureReported } from '@/store/slices/quizSubmit.slice';
import styles from './QuizTakingPage.module.css';

const AUTOSAVE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const QuizTakingPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { data: quiz, isLoading, error: fetchError } = useGetQuizQuery(id, { skip: !id });
  const [saveAnswers] = useSaveAnswersMutation();
  const [submitQuiz, { isLoading: isSubmitting }] = useSubmitQuizMutation();

  // UI-only state — the only local state besides dirty answers
  const [currentIndex, setCurrentIndex] = useState(0);

  // Tracks answers the user has typed but not yet confirmed saved by the server.
  // NOT a copy of API data — this only holds what the user typed this session.
  const [dirtyAnswers, setDirtyAnswers] = useState<Record<string, string>>({});

  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs for stable access from callbacks and cleanup — avoid stale closures
  const dirtyRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(saveAnswers);
  const idRef = useRef(id);
  const isMountedRef = useRef(true);
  saveRef.current = saveAnswers;
  idRef.current = id;

  // Sends all current dirty answers to the server. Returns a promise so the
  // submit flow can await it before triggering grading.
  // On success: removes the sent entries from dirty (new edits made while in-flight are kept).
  const doSave = useCallback((): Promise<void> => {
    const entries = Object.entries(dirtyRef.current);
    if (!entries.length) return Promise.resolve();
    const sentKeys = new Set(entries.map(([key]) => key));
    return saveRef
      .current({
        id: idRef.current,
        answers: entries.map(([questionId, answer]) => ({ questionId, answer })),
      })
      .unwrap()
      .then(() => {
        // Remove only the keys that were sent — edits made while in-flight are preserved
        const remaining = Object.fromEntries(
          Object.entries(dirtyRef.current).filter(([k]) => !sentKeys.has(k)),
        );
        dirtyRef.current = remaining;
        if (isMountedRef.current) {
          setDirtyAnswers(remaining);
          setSaveError(null);
        }
      })
      .catch((err: unknown) => {
        if (isMountedRef.current) setSaveError(parseApiError(err).message);
      });
  }, []);

  const handleAnswerChange = useCallback(
    (questionId: string, answer: string) => {
      const updated = { ...dirtyRef.current, [questionId]: answer };
      dirtyRef.current = updated;
      setDirtyAnswers(updated);
      setSaveError(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void doSave(), AUTOSAVE_DELAY_MS);
    },
    [doSave],
  );

  // Flush any pending debounced save when the user navigates away
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void doSave();
    };
  }, [doSave]);

  // Redirect to results when quiz is already submitted (grading, completed, submitted_ungraded)
  useEffect(() => {
    if (quiz && [QuizStatus.GRADING, QuizStatus.COMPLETED, QuizStatus.SUBMITTED_UNGRADED].includes(quiz.status)) {
      navigate(`/quiz/${id}/results`, { replace: true });
    }
  }, [quiz, id, navigate]);

  const handleSubmit = async () => {
    if (!quiz) return;

    // Flush pending debounced save before submitting
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await doSave();

    // Build the full answer list from merged state for the submit payload
    const finalAnswers = quiz.answers.map((a) => ({
      questionId: a.questionId,
      answer: dirtyRef.current[a.questionId] ?? a.userAnswer ?? '',
    }));

    // Submit starts a grading SSE stream on the server. Do not await here:
    // we want to return users to the session page immediately.
    const submitPromise = submitQuiz({ id, answers: finalAnswers }).unwrap();
    void submitPromise.catch((err: unknown) => {
      // Keep this as a non-blocking best-effort submission. If it fails, the
      // session poll will keep the user informed via attempt status.
      const fbqErr = err as FetchBaseQueryError;
      const isStreamStarted =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        fbqErr.status === 'PARSING_ERROR' &&
        typeof fbqErr.originalStatus === 'number' &&
        fbqErr.originalStatus >= 200 &&
        fbqErr.originalStatus < 300;

      if (!isStreamStarted) {
        dispatch(
          submitFailureReported({
          quizAttemptId: id,
          sessionId: quiz.sessionId,
          message: parseApiError(err).message,
          createdAt: new Date().toISOString(),
          }),
        );
        dispatch(api.util.invalidateTags([{ type: 'Session', id: quiz.sessionId }]));
      }
    });

    // Force a session refresh so the just-submitted attempt shows grading status.
    dispatch(api.util.invalidateTags([{ type: 'Session', id: quiz.sessionId }]));
    navigate(`/sessions/${quiz.sessionId}`, { replace: true });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!id) return null;

  if (isLoading) return <LoadingSpinner fullPage />;

  if (fetchError) {
    const { message } = parseApiError(fetchError);
    return (
      <div className={styles.errorPage}>
        <p className={styles.errorMsg}>{message}</p>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    );
  }

  if (!quiz) return null;

  // Prevent flash: if the quiz is already submitted, show a spinner while the
  // useEffect redirect fires (runs after first paint without this guard).
  if (
    [QuizStatus.GRADING, QuizStatus.COMPLETED, QuizStatus.SUBMITTED_UNGRADED].includes(quiz.status)
  ) {
    return <LoadingSpinner fullPage />;
  }

  // Merge dirty (pending) answers over cached server answers for display
  const effectiveAnswers = quiz.answers.map((a) => ({
    ...a,
    userAnswer: dirtyAnswers[a.questionId] !== undefined ? dirtyAnswers[a.questionId] : a.userAnswer,
  }));

  const allAnswered = effectiveAnswers.every(
    (a) => a.userAnswer !== null && a.userAnswer !== '',
  );

  const unansweredCount = effectiveAnswers.filter(
    (a) => a.userAnswer === null || a.userAnswer === '',
  ).length;

  const currentQuestion = quiz.questions[currentIndex];
  const currentAnswer =
    effectiveAnswers.find((a) => a.questionId === currentQuestion?.id)?.userAnswer ?? null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <QuestionNav
          questions={quiz.questions}
          answers={effectiveAnswers}
          currentIndex={currentIndex}
          onNavigate={setCurrentIndex}
        />

        <div className={styles.submitArea}>
          {saveError && <p className={styles.saveError}>{saveError}</p>}

          <button
            type="button"
            className={styles.submitBtn}
            disabled={!allAnswered || isSubmitting}
            onClick={() => void handleSubmit()}
            title={!allAnswered ? 'Answer all questions to submit' : undefined}
          >
            {isSubmitting ? 'Submitting…' : 'Complete Quiz'}
          </button>

          {!allAnswered && (
            <p className={styles.hint}>
              {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} unanswered
            </p>
          )}

        </div>
      </aside>

      <main className={styles.main}>
        {currentQuestion && (
          <ComponentErrorBoundary>
            <QuestionCard
              question={currentQuestion}
              currentAnswer={currentAnswer}
              onAnswerChange={handleAnswerChange}
              totalQuestions={quiz.questions.length}
            />
          </ComponentErrorBoundary>
        )}
      </main>
    </div>
  );
};

export default QuizTakingPage;
