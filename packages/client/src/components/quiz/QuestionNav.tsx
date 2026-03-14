import type { FailedSlot } from '@/store/slices/quizStream.slice';
import { Button } from '@/components/common/Button';
import styles from './QuestionNav.module.css';

interface QuestionNavProps {
  questions: Array<{ id: string; questionNumber: number }>;
  answers: Array<{ questionId: string; userAnswer: string | null }>;
  failedSlots: FailedSlot[];
  currentIndex: number;
  totalSlots: number;
  onNavigate: (index: number) => void;
}

export const QuestionNav = ({ questions, answers, failedSlots, currentIndex, totalSlots, onNavigate }: QuestionNavProps) => {
  const answeredIds = new Set(
    answers
      .filter((a) => a.userAnswer !== null && a.userAnswer !== '')
      .map((a) => a.questionId),
  );

  // Failed slots that fall beyond the questions array
  const trailingFailed = failedSlots.filter(
    (f) => f.questionNumber > questions.length,
  );

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < totalSlots - 1;

  return (
    <nav className={styles.nav} aria-label="Question navigation">
      <div className={styles.grid}>
        {questions.map((question, index) => {
          const isCurrent = index === currentIndex;
          const isAnswered = answeredIds.has(question.id);
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onNavigate(index)}
              aria-label={`Question ${question.questionNumber}${isAnswered ? ', answered' : ', unanswered'}`}
              aria-current={isCurrent ? 'true' : undefined}
              className={[
                styles.navBtn,
                isCurrent ? styles.current : '',
                isAnswered && !isCurrent ? styles.answered : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {question.questionNumber}
            </button>
          );
        })}
        {trailingFailed.map((slot) => {
          const index = questions.length + trailingFailed.indexOf(slot);
          const isCurrent = index === currentIndex;
          return (
            <button
              key={`failed-${slot.questionNumber}`}
              type="button"
              onClick={() => onNavigate(index)}
              aria-label={`Question ${slot.questionNumber}, failed`}
              aria-current={isCurrent ? 'true' : undefined}
              className={[
                styles.navBtn,
                styles.failed,
                isCurrent ? styles.current : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {slot.questionNumber}
            </button>
          );
        })}
      </div>

      <div className={styles.prevNext}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={styles.prevNextBtn}
          disabled={!canGoPrev}
          onClick={() => onNavigate(currentIndex - 1)}
          aria-label="Previous question"
        >
          ← Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={styles.prevNextBtn}
          disabled={!canGoNext}
          onClick={() => onNavigate(currentIndex + 1)}
          aria-label="Next question"
        >
          Next →
        </Button>
      </div>
    </nav>
  );
};
