import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { QuizStatus, type Question } from '@skills-trainer/shared';

import { useGetQuizQuery, useSaveAnswersMutation, useSubmitQuizMutation } from '@/api/quizzes.api';
import { parseApiError } from '@/hooks/useApiError';
import { useToast } from '@/hooks/useToast';
import { extractHttpStatus, getUserMessage } from '@/utils/error-messages';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/common/Button';
import { ComponentErrorBoundary } from '@/components/common/ErrorBoundary';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { QuestionFailedCard } from '@/components/quiz/QuestionFailedCard';
import { QuestionNav } from '@/components/quiz/QuestionNav';
import { api } from '@/store/api';
import { useAppDispatch } from '@/store/store';
import { submitFailureReported } from '@/store/slices/quizSubmit.slice';
import { useQuizGenerationContext } from '@/providers/QuizGenerationProvider';
import { Sentry } from '@/config/sentry';
import { toSentryError } from '@/utils/sentry.utils';
import styles from './QuizTakingPage.module.css';

const AUTOSAVE_DELAY_MS = 1000;
const TIER_1_MS = 5000;
const TIER_2_MS = 15000;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const QuizTakingPage = () => {
  const { id = '', sessionId = '' } = useParams<{ id: string; sessionId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const dispatch = useAppDispatch();

  const { data: quiz, isLoading, error: fetchError } = useGetQuizQuery(id, { skip: !id });
  const [saveAnswers] = useSaveAnswersMutation();
  const [submitQuiz, { isLoading: isSubmitting }] = useSubmitQuizMutation();

  const {
    status: generationStatus,
    questions: streamingQuestions,
    failedSlots,
  } = useQuizGenerationContext();

  const isGenerationInProgress = generationStatus === 'connecting' || generationStatus === 'generating';

  // Merge DB questions with streaming questions (dedup by id)
  const mergedQuestions: Question[] = useMemo(() => {
    const dbQuestions = quiz?.questions ?? [];
    if (!isGenerationInProgress || streamingQuestions.length === 0) return dbQuestions;

    const dbIds = new Set(dbQuestions.map((q) => q.id));
    const newFromStream = streamingQuestions.filter((q) => !dbIds.has(q.id));
    return [...dbQuestions, ...newFromStream];
  }, [quiz?.questions, streamingQuestions, isGenerationInProgress]);

  // UI-only state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dirtyAnswers, setDirtyAnswers] = useState<Record<string, string>>({});

  // Tiered "Next" button waiting state
  const [waitStartTime, setWaitStartTime] = useState<number | null>(null);
  const [waitElapsed, setWaitElapsed] = useState(0);

  // Refs for stable access from callbacks and cleanup
  const dirtyRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(saveAnswers);
  const idRef = useRef(id);
  const isMountedRef = useRef(true);
  saveRef.current = saveAnswers;
  idRef.current = id;

  // Failed slots beyond the last question are navigable (user can see the info card)
  const trailingFailedSlots = failedSlots.filter(
    (f) => f.questionNumber > mergedQuestions.length,
  ).length;
  const totalSlots = mergedQuestions.length + trailingFailedSlots;

  // Track if the next question is not yet available
  const nextQuestionExists = currentIndex + 1 < totalSlots;
  const isWaitingForNext = !nextQuestionExists && isGenerationInProgress;

  // Start/stop wait timer for tiered messaging
  useEffect(() => {
    if (isWaitingForNext && waitStartTime === null) {
      setWaitStartTime(Date.now());
    } else if (!isWaitingForNext) {
      setWaitStartTime(null);
      setWaitElapsed(0);
    }
  }, [isWaitingForNext, waitStartTime]);

  useEffect(() => {
    if (waitStartTime === null) return;
    const interval = setInterval(() => {
      setWaitElapsed(Date.now() - waitStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [waitStartTime]);

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
        const remaining = Object.fromEntries(
          Object.entries(dirtyRef.current).filter(([k]) => !sentKeys.has(k)),
        );
        dirtyRef.current = remaining;
        if (isMountedRef.current) {
          setDirtyAnswers(remaining);
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Quiz autosave failed:', err);
        Sentry.captureException(toSentryError(err, 'quiz autosave failed'), {
          extra: {
            operation: 'saveAnswers',
            stage: 'doSave',
            quizId: idRef.current,
            sessionId: quiz?.sessionId ?? null,
            pendingAnswerCount: entries.length,
            originalError: err,
          },
        });
        const { code } = parseApiError(err);
        const status = extractHttpStatus(err);
        const userMessage = getUserMessage(code, 'save-answer', status);
        if (isMountedRef.current) {
          showError(userMessage.title, userMessage.description);
        }
      });
  }, [showError, quiz?.sessionId]);

  const handleAnswerChange = useCallback(
    (questionId: string, answer: string) => {
      const updated = { ...dirtyRef.current, [questionId]: answer };
      dirtyRef.current = updated;
      setDirtyAnswers(updated);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void doSave(), AUTOSAVE_DELAY_MS);
    },
    [doSave],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void doSave();
    };
  }, [doSave]);

  // Redirect to results when quiz is already submitted
  useEffect(() => {
    if (quiz && [QuizStatus.GRADING, QuizStatus.COMPLETED, QuizStatus.SUBMITTED_UNGRADED].includes(quiz.status)) {
      navigate(`/sessions/${sessionId}/quiz/${id}/results`, { replace: true });
    }
  }, [quiz, id, sessionId, navigate]);

  const handleSubmit = async () => {
    if (!quiz) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await doSave();

    const finalAnswers = quiz.answers.map((a) => ({
      questionId: a.questionId,
      answer: dirtyRef.current[a.questionId] ?? a.userAnswer ?? '',
    }));

    const submitPromise = submitQuiz({ id, answers: finalAnswers }).unwrap();
    void submitPromise
      .then(() => {
        showSuccess('Submitted your quiz!', 'Sit tight - your answers are being graded.');
      })
      .catch((err: unknown) => {
        const fbqErr = err as FetchBaseQueryError;
        const isStreamStarted =
          typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          fbqErr.status === 'PARSING_ERROR' &&
          typeof fbqErr.originalStatus === 'number' &&
          fbqErr.originalStatus >= 200 &&
          fbqErr.originalStatus < 300;

        if (isStreamStarted) {
          showSuccess('Submitted your quiz!', 'Sit tight - your answers are being graded.');
        } else {
          // eslint-disable-next-line no-console
          console.error('Quiz submit failed:', err);
          Sentry.captureException(toSentryError(err, 'quiz submit failed'), {
            extra: {
              operation: 'submitQuiz',
              stage: 'submit',
              quizId: id,
              sessionId: quiz.sessionId,
              originalError: err,
            },
          });
          const { code } = parseApiError(err);
          const status = extractHttpStatus(err);
          const userMessage = getUserMessage(code, 'submit-quiz', status);
          showError(userMessage.title, userMessage.description);
          dispatch(
            submitFailureReported({
              quizAttemptId: id,
              sessionId: quiz.sessionId,
              message: userMessage.description,
              createdAt: new Date().toISOString(),
            }),
          );
          dispatch(api.util.invalidateTags([{ type: 'Session', id: quiz.sessionId }]));
        }
      });

    dispatch(api.util.invalidateTags([{ type: 'Session', id: quiz.sessionId }, { type: 'Quiz', id }]));
    navigate(`/sessions/${quiz.sessionId}`, { replace: true, state: { justSubmittedQuizId: id } });
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
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  // Allow rendering with streaming questions even if quiz API hasn't returned yet
  if (!quiz && mergedQuestions.length === 0) return null;

  // Prevent flash for already-submitted quizzes
  if (
    quiz &&
    [QuizStatus.GRADING, QuizStatus.COMPLETED, QuizStatus.SUBMITTED_UNGRADED].includes(quiz.status)
  ) {
    return <LoadingSpinner fullPage />;
  }

  // Merge dirty answers over cached server answers for display
  const effectiveAnswers = (quiz?.answers ?? []).map((a) => ({
    ...a,
    userAnswer: dirtyAnswers[a.questionId] !== undefined ? dirtyAnswers[a.questionId] : a.userAnswer,
  }));

  const allAnswered = !isGenerationInProgress && effectiveAnswers.every(
    (a) => a.userAnswer !== null && a.userAnswer !== '',
  );

  const unansweredCount = effectiveAnswers.filter(
    (a) => a.userAnswer === null || a.userAnswer === '',
  ).length;

  const currentQuestion = mergedQuestions[currentIndex];
  const currentAnswer =
    effectiveAnswers.find((a) => a.questionId === currentQuestion?.id)?.userAnswer ?? null;

  // Check if current question is a failed slot
  const currentFailedSlot = currentQuestion
    ? failedSlots.find((f) => f.questionNumber === currentQuestion.questionNumber)
    : failedSlots.find((f) => f.questionNumber === currentIndex + 1);

  // Tiered "Next" button text
  const getNextButtonContent = (): { text: string; showSaveLink: boolean } => {
    if (!isWaitingForNext) return { text: 'Next', showSaveLink: false };
    if (waitElapsed < TIER_1_MS) return { text: 'Preparing next question...', showSaveLink: false };
    if (waitElapsed < TIER_2_MS) return { text: 'Still working on it — this can take a few seconds...', showSaveLink: false };
    return { text: 'This is taking longer than expected.', showSaveLink: true };
  };

  const nextButton = getNextButtonContent();
  const isLastQuestion = !isGenerationInProgress && currentIndex === totalSlots - 1;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <QuestionNav
          questions={mergedQuestions}
          answers={effectiveAnswers}
          failedSlots={failedSlots}
          currentIndex={currentIndex}
          totalSlots={totalSlots}
          onNavigate={setCurrentIndex}
        />

        <div className={styles.submitArea}>
          <Button
            type="button"
            variant="primary"
            disabled={!allAnswered || isSubmitting}
            onClick={() => void handleSubmit()}
            title={!allAnswered ? 'Answer all questions to submit' : undefined}
          >
            {isSubmitting ? 'Submitting…' : 'Complete Quiz'}
          </Button>

          {isGenerationInProgress && (
            <p className={styles.hint}>
              Quiz generation in progress...
            </p>
          )}

          {!allAnswered && !isGenerationInProgress && (
            <p className={styles.hint}>
              {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} unanswered
            </p>
          )}

          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => navigate(`/sessions/${sessionId}`)}
          >
            Save &amp; Quit
          </Button>
        </div>
      </aside>

      <main className={styles.main}>
        {/* Failed slot card */}
        {currentFailedSlot && !currentQuestion && (
          <QuestionFailedCard
            questionNumber={currentFailedSlot.questionNumber}
            message={currentFailedSlot.message}
          />
        )}

        {/* Normal question card */}
        {currentQuestion && !currentFailedSlot && (
          <ComponentErrorBoundary>
            <QuestionCard
              question={currentQuestion}
              currentAnswer={currentAnswer}
              onAnswerChange={handleAnswerChange}
              totalQuestions={totalSlots}
            />
          </ComponentErrorBoundary>
        )}

        {/* Navigation buttons */}
        <div className={styles.navButtons}>
          {currentIndex > 0 && (
            <Button
              variant="secondary"
              onClick={() => setCurrentIndex(currentIndex - 1)}
            >
              Previous
            </Button>
          )}

          {!isLastQuestion && (
            <Button
              variant="secondary"
              disabled={isWaitingForNext}
              onClick={() => setCurrentIndex(currentIndex + 1)}
            >
              {isWaitingForNext && waitElapsed < TIER_2_MS && (
                <LoadingSpinner inline size="sm" />
              )}
              {isWaitingForNext ? nextButton.text : 'Next'}
            </Button>
          )}
        </div>

        {nextButton.showSaveLink && (
          <p className={styles.hint}>
            <button
              type="button"
              className="text-link"
              onClick={() => navigate(`/sessions/${sessionId}`)}
            >
              Save progress and come back later
            </button>
          </p>
        )}
      </main>
    </div>
  );
};

export default QuizTakingPage;
