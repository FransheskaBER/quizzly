import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { QuizStatus } from '@skills-trainer/shared';

import { useGetQuizQuery, useGetResultsQuery } from '@/api/quizzes.api';
import { useQuizGrading } from '@/hooks/useQuizGrading';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ResultSummary } from '@/components/quiz/ResultSummary';
import { QuestionResult } from '@/components/quiz/QuestionResult';
import { parseApiError } from '@/hooks/useApiError';
import styles from './QuizResultsPage.module.css';

const POLL_INTERVAL_MS = 2000;

const isTerminalStatus = (status: string): boolean =>
  status === QuizStatus.COMPLETED || status === QuizStatus.SUBMITTED_UNGRADED;

const QuizResultsPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Stop polling once the quiz reaches a terminal status so we don't keep hitting
  // the API after results are displayed.
  const [pollingActive, setPollingActive] = useState(true);

  const {
    data: quiz,
    isLoading: quizLoading,
    error: quizError,
  } = useGetQuizQuery(id, {
    skip: !id,
    pollingInterval: pollingActive ? POLL_INTERVAL_MS : 0,
  });

  useEffect(() => {
    if (quiz && isTerminalStatus(quiz.status)) {
      setPollingActive(false);
    }
  }, [quiz]);

  // Fetch full results only once grading is complete.
  const { data: results, isLoading: resultsLoading } = useGetResultsQuery(id, {
    skip: !id || quiz?.status !== QuizStatus.COMPLETED,
  });

  // Regrade SSE hook — only active when user triggers regrade on submitted_ungraded.
  const {
    regrade,
    gradingStatus,
    gradedQuestions,
    gradingError,
    warning: gradingWarning,
    reset: resetGrading,
  } = useQuizGrading(id);

  // Restart polling after a successful regrade so we pick up COMPLETED status.
  useEffect(() => {
    if (gradingStatus === 'complete') {
      setPollingActive(true);
    }
  }, [gradingStatus]);

  // Redirect to taking page when the quiz hasn't been submitted yet.
  // Done in useEffect to avoid calling navigate() during render.
  useEffect(() => {
    if (
      quiz &&
      (quiz.status === QuizStatus.GENERATING || quiz.status === QuizStatus.IN_PROGRESS)
    ) {
      navigate(`/quiz/${id}`, { replace: true });
    }
  }, [quiz, id, navigate]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (!id || quizLoading) return <LoadingSpinner fullPage />;

  if (quizError) {
    const { message } = parseApiError(quizError);
    return (
      <div className={styles.page}>
        <div className={styles.stateBox}>
          <p className={styles.errorMsg}>{message}</p>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!quiz) return null;

  const sessionId = quiz.sessionId;

  // ---------------------------------------------------------------------------
  // Status: generating or in_progress — redirect handled by useEffect above
  // ---------------------------------------------------------------------------

  if (
    quiz.status === QuizStatus.GENERATING ||
    quiz.status === QuizStatus.IN_PROGRESS
  ) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Status: grading — polling spinner
  // ---------------------------------------------------------------------------

  if (quiz.status === QuizStatus.GRADING) {
    return (
      <div className={styles.page}>
        <div className={styles.stateBox}>
          <LoadingSpinner />
          <p className={styles.gradingMsg}>Grading your quiz…</p>
          <p className={styles.gradingHint}>This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Status: submitted_ungraded — grading stalled, offer regrade
  // ---------------------------------------------------------------------------

  if (quiz.status === QuizStatus.SUBMITTED_UNGRADED) {
    // Regrade SSE finished but the poll hasn't updated quiz.status to COMPLETED yet.
    // Show a loading state so the user sees progress rather than a stale error prompt.
    if (gradingStatus === 'complete') {
      return (
        <div className={styles.page}>
          <div className={styles.stateBox}>
            <LoadingSpinner />
            <p className={styles.gradingMsg}>Loading results…</p>
          </div>
        </div>
      );
    }

    if (gradingStatus === 'connecting' || gradingStatus === 'grading') {
      return (
        <div className={styles.page}>
          <div className={styles.stateBox}>
            <LoadingSpinner />
            <p className={styles.gradingMsg}>
              Regrading… ({gradedQuestions.length}&nbsp;/&nbsp;{quiz.questionCount} graded)
            </p>
            {gradingWarning && <p className={styles.warning}>{gradingWarning}</p>}
          </div>
        </div>
      );
    }

    if (gradingStatus === 'error') {
      return (
        <div className={styles.page}>
          <div className={styles.stateBox}>
            <p className={styles.errorMsg}>
              {gradingError ?? 'Regrading failed. Please try again.'}
            </p>
            <button
              className={styles.primaryBtn}
              onClick={() => {
                resetGrading();
                regrade();
              }}
            >
              Retry Regrade
            </button>
            <Link to={`/sessions/${sessionId}`} className={styles.backLink}>
              ← Back to session
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <div className={styles.stateBox}>
          <p className={styles.errorMsg}>
            Grading could not be completed. This can happen when the AI service is temporarily
            unavailable.
          </p>
          <button className={styles.primaryBtn} onClick={regrade}>
            Regrade Quiz
          </button>
          <Link to={`/sessions/${sessionId}`} className={styles.backLink}>
            ← Back to session
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Status: completed — show full results
  // ---------------------------------------------------------------------------

  if (resultsLoading || !results) {
    return <LoadingSpinner fullPage />;
  }

  const scoreTitle =
    results.score === 100
      ? 'Perfect score'
      : results.score !== null && results.score >= 70
        ? 'Great effort'
        : results.score !== null && results.score < 50
          ? 'Keep practicing'
          : 'Quiz Results';

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to={`/sessions/${sessionId}`} className={styles.backLink}>
          ← Back to session
        </Link>

        <h1 className={styles.title}>{scoreTitle}</h1>

        <ResultSummary
          score={results.score}
          summary={results.summary}
          answerFormat={results.answerFormat}
        />

        <div className={styles.questionList}>
          {results.questions.map((q) => (
            <QuestionResult key={q.id} result={q} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuizResultsPage;
