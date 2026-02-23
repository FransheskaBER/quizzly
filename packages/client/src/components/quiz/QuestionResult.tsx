import { memo } from 'react';
import ReactMarkdown from 'react-markdown';

import type { QuestionResult as QuestionResultType } from '@skills-trainer/shared';
import { QuestionType } from '@skills-trainer/shared';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import styles from './QuestionResult.module.css';

interface QuestionResultProps {
  result: QuestionResultType;
}

const scoreLabel = (score: number | null, questionType: QuestionType): string => {
  if (score === null) return 'ungraded';
  if (questionType === QuestionType.MCQ) return score >= 1 ? 'correct' : 'incorrect';
  if (score >= 1) return 'correct';
  if (score > 0) return 'partial';
  return 'incorrect';
};

const QuestionResultInner = ({ result }: QuestionResultProps) => {
  const label = scoreLabel(result.answer.score, result.questionType);
  const isMcq = result.questionType === QuestionType.MCQ;

  return (
    <div className={`${styles.card} ${styles[label]}`}>
      <div className={styles.header}>
        <span className={styles.questionNum}>Q{result.questionNumber}</span>
        <span className={`${styles.badge} ${styles[`badge_${label}`]}`}>{label}</span>
      </div>

      <div className={styles.questionText}>
        <ReactMarkdown>{result.questionText}</ReactMarkdown>
      </div>

      {isMcq && result.options && (
        <ul className={styles.options}>
          {result.options.map((option) => {
            const isCorrect = option === result.correctAnswer;
            const isUserAnswer = option === result.answer.userAnswer;
            return (
              <li
                key={option}
                className={`${styles.option} ${isCorrect ? styles.optionCorrect : ''} ${isUserAnswer && !isCorrect ? styles.optionWrong : ''}`}
              >
                <span>{option}</span>
                {isCorrect && <span className={styles.optionTag}>✓ Correct</span>}
                {isUserAnswer && !isCorrect && (
                  <span className={styles.optionTag}>Your answer</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isMcq && (
        <div className={styles.freeTextAnswers}>
          <div className={styles.answerBlock}>
            <span className={styles.answerLabel}>Your answer</span>
            <p className={styles.answerText}>{result.answer.userAnswer ?? '(no answer)'}</p>
          </div>
          <div className={styles.answerBlock}>
            <span className={styles.answerLabel}>Model answer</span>
            <div className={styles.answerText}>
              <ReactMarkdown>{result.correctAnswer}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      <div className={styles.feedback}>
        <p className={styles.feedbackText}>{result.answer.feedback}</p>
      </div>

      <details className={styles.explanation}>
        <summary className={styles.explanationToggle}>Explanation</summary>
        <div className={styles.explanationText}>
          <ReactMarkdown>{result.explanation}</ReactMarkdown>
        </div>
      </details>
    </div>
  );
};

const QuestionResultWithBoundary = ({ result }: QuestionResultProps) => (
  <ErrorBoundary
    fallback={
      <div className={styles.boundaryError}>
        <p>Failed to render question {result.questionNumber}.</p>
      </div>
    }
  >
    <QuestionResultInner result={result} />
  </ErrorBoundary>
);

/**
 * Displays a single graded question with the user's answer, correct answer,
 * score badge, feedback, and collapsible explanation.
 * React.memo prevents re-renders when sibling questions update.
 * Wrapped in an ErrorBoundary so a crash in one card doesn't break the whole list.
 */
export const QuestionResult = memo(QuestionResultWithBoundary);
