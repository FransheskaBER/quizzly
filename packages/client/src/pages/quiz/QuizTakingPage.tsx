import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { useGetQuizQuery, useSaveAnswersMutation, useSubmitQuizMutation } from '@/api/quizzes.api';
import { parseApiError } from '@/hooks/useApiError';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { QuestionNav } from '@/components/quiz/QuestionNav';
import styles from './QuizTakingPage.module.css';

const AUTOSAVE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const QuizTakingPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: quiz, isLoading, error: fetchError } = useGetQuizQuery(id, { skip: !id });
  const [saveAnswers] = useSaveAnswersMutation();
  const [submitQuiz, { isLoading: isSubmitting }] = useSubmitQuizMutation();

  // UI-only state — the only local state besides dirty answers
  const [currentIndex, setCurrentIndex] = useState(0);

  // Tracks answers the user has typed but not yet confirmed saved by the server.
  // NOT a copy of API data — this only holds what the user typed this session.
  const [dirtyAnswers, setDirtyAnswers] = useState<Record<string, string>>({});

  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refs for stable access from callbacks and cleanup — avoid stale closures
  const dirtyRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(saveAnswers);
  const idRef = useRef(id);
  saveRef.current = saveAnswers;
  idRef.current = id;

  // Sends all current dirty answers to the server. Returns a promise so the
  // submit flow can await it before triggering grading.
  const doSave = useCallback((): Promise<void> => {
    const entries = Object.entries(dirtyRef.current);
    if (!entries.length) return Promise.resolve();
    return saveRef
      .current({
        id: idRef.current,
        answers: entries.map(([questionId, answer]) => ({ questionId, answer })),
      })
      .unwrap()
      .then(() => setSaveError(null))
      .catch((err: unknown) => setSaveError(parseApiError(err).message));
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void doSave();
    };
  }, [doSave]);

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

    try {
      await submitQuiz({ id, answers: finalAnswers }).unwrap();
      navigate(`/quiz/${id}/results`);
    } catch (err) {
      // fetchBaseQuery returns status: 'PARSING_ERROR' when the server responds
      // with a non-JSON body (i.e. the SSE stream started — Task 026 handles it).
      // That means the submit was accepted; navigate to results.
      const isStreamStarted =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as FetchBaseQueryError).status === 'PARSING_ERROR';

      if (isStreamStarted) {
        navigate(`/quiz/${id}/results`);
      } else {
        setSubmitError(parseApiError(err).message);
      }
    }
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
            {isSubmitting ? 'Submitting…' : 'Submit Quiz'}
          </button>

          {!allAnswered && (
            <p className={styles.hint}>
              {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} unanswered
            </p>
          )}

          {submitError && <p className={styles.submitError}>{submitError}</p>}
        </div>
      </aside>

      <main className={styles.main}>
        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            currentAnswer={currentAnswer}
            onAnswerChange={handleAnswerChange}
            totalQuestions={quiz.questions.length}
          />
        )}
      </main>
    </div>
  );
};

export default QuizTakingPage;
