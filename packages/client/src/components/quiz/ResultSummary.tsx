import type { QuizResultsSummary } from '@skills-trainer/shared';
import { AnswerFormat } from '@skills-trainer/shared';

import { formatScore } from '@/utils/formatters';
import styles from './ResultSummary.module.css';

interface ResultSummaryProps {
  score: number | null;
  summary: QuizResultsSummary;
  answerFormat: AnswerFormat;
}

export const ResultSummary = ({ score, summary, answerFormat }: ResultSummaryProps) => {
  const isMcq = answerFormat === AnswerFormat.MCQ;

  return (
    <div className={styles.container}>
      <div className={styles.scoreBlock}>
        <span className={styles.scoreValue}>{formatScore(score)}</span>
        <span className={styles.scoreLabel}>Final Score</span>
      </div>

      <div className={styles.breakdown}>
        <div className={`${styles.stat} ${styles.correct}`}>
          <span className={styles.statValue}>{summary.correct}</span>
          <span className={styles.statLabel}>Correct</span>
        </div>

        {!isMcq && (
          <div className={`${styles.stat} ${styles.partial}`}>
            <span className={styles.statValue}>{summary.partial}</span>
            <span className={styles.statLabel}>Partial</span>
          </div>
        )}

        <div className={`${styles.stat} ${styles.incorrect}`}>
          <span className={styles.statValue}>{summary.incorrect}</span>
          <span className={styles.statLabel}>Incorrect</span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statValue}>{summary.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
      </div>
    </div>
  );
};
