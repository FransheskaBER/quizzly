import { useNavigate } from 'react-router-dom';

import type { Question } from '@skills-trainer/shared';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import styles from './QuizProgress.module.css';

const PREVIEW_MAX_CHARS = 80;

export type ActiveGenerationStatus = 'connecting' | 'generating' | 'complete' | 'error';

interface QuizProgressProps {
  status: ActiveGenerationStatus;
  questions: Question[];
  totalExpected: number;
  progressMessage: string | null;
  warning: string | null;
  error: string | null;
  quizAttemptId: string | null;
  onReset: () => void;
}

const QuizProgressInner = ({
  status,
  questions,
  totalExpected,
  progressMessage,
  warning,
  error,
  quizAttemptId,
  onReset,
}: QuizProgressProps) => {
  const navigate = useNavigate();

  if (status === 'error') {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorMessage}>{error ?? 'Generation failed. Please try again.'}</p>
        <button className={styles.retryBtn} onClick={onReset}>
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'complete' && quizAttemptId) {
    return (
      <div className={styles.completeState}>
        <p className={styles.completeMessage}>
          Quiz ready — {questions.length} question{questions.length !== 1 ? 's' : ''} generated.
        </p>
        <button className={styles.startBtn} onClick={() => navigate(`/quiz/${quizAttemptId}`)}>
          Start Quiz
        </button>
      </div>
    );
  }

  const progressPercent =
    totalExpected > 0 ? Math.min((questions.length / totalExpected) * 100, 100) : 0;

  return (
    <div className={styles.streamingState}>
      <div className={styles.statusRow}>
        <LoadingSpinner />
        <span className={styles.statusMessage}>{progressMessage ?? 'Connecting…'}</span>
      </div>

      {warning && <p className={styles.warning}>{warning}</p>}

      {totalExpected > 0 && (
        <div className={styles.progressRow}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <span className={styles.progressCount}>
            {questions.length} / {totalExpected}
          </span>
        </div>
      )}

      {questions.length > 0 && (
        <div className={styles.questionList}>
          {questions.map((q) => (
            <div key={q.id} className={styles.questionPreview}>
              <span className={styles.questionNum}>Q{q.questionNumber}</span>
              <span className={styles.questionText}>
                {q.questionText.length > PREVIEW_MAX_CHARS
                  ? `${q.questionText.slice(0, PREVIEW_MAX_CHARS)}…`
                  : q.questionText}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Displays live quiz generation progress streamed over SSE.
 * Wrapped in an ErrorBoundary so a rendering crash shows an inline error
 * with a reset button rather than crashing the whole session page.
 */
export const QuizProgress = (props: QuizProgressProps) => (
  <ErrorBoundary level="component"
    fallback={
      <div className={styles.boundaryError}>
        <p>Something went wrong displaying the quiz progress.</p>
        <button onClick={props.onReset}>Reset</button>
      </div>
    }
  >
    <QuizProgressInner {...props} />
  </ErrorBoundary>
);
