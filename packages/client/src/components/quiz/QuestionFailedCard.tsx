import styles from './QuestionFailedCard.module.css';

interface QuestionFailedCardProps {
  questionNumber: number;
  message: string;
}

export const QuestionFailedCard = ({ questionNumber, message }: QuestionFailedCardProps) => (
  <div className={styles.card}>
    <div className={styles.header}>
      <span className={styles.label}>Question {questionNumber}</span>
    </div>
    <div className={styles.body}>
      <p className={styles.message}>{message}</p>
    </div>
  </div>
);
