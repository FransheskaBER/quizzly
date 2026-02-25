import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  generateQuizQuerySchema,
  QuizDifficulty,
  AnswerFormat,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
} from '@skills-trainer/shared';
import type { GenerateQuizQuery } from '@skills-trainer/shared';

import { FormError } from '@/components/common/FormError';
import { Button } from '@/components/common/Button';
import styles from './QuizPreferences.module.css';

const DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  [QuizDifficulty.EASY]: 'Easy',
  [QuizDifficulty.MEDIUM]: 'Medium',
  [QuizDifficulty.HARD]: 'Hard',
};

const FORMAT_LABELS: Record<AnswerFormat, string> = {
  [AnswerFormat.MCQ]: 'Multiple Choice',
  [AnswerFormat.FREE_TEXT]: 'Free Text',
  [AnswerFormat.MIXED]: 'Mixed',
};

interface QuizPreferencesProps {
  onGenerate: (preferences: GenerateQuizQuery) => void;
  isDisabled: boolean;
  error: string | null;
}

export const QuizPreferences = ({ onGenerate, isDisabled, error }: QuizPreferencesProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GenerateQuizQuery>({
    resolver: zodResolver(generateQuizQuerySchema),
    defaultValues: {
      difficulty: QuizDifficulty.MEDIUM,
      format: AnswerFormat.MIXED,
      count: 10,
    },
  });

  return (
    <form onSubmit={handleSubmit(onGenerate)} noValidate className={styles.form}>
      <FormError message={error} />

      <div className={styles.field}>
        <span className={styles.label}>Difficulty</span>
        <div className={styles.radioGroup}>
          {Object.values(QuizDifficulty).map((d) => (
            <label key={d} className={styles.radioLabel}>
              <input type="radio" value={d} {...register('difficulty')} />
              {DIFFICULTY_LABELS[d]}
            </label>
          ))}
        </div>
        {errors.difficulty && <p className={styles.errorText}>{errors.difficulty.message}</p>}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Format</span>
        <div className={styles.radioGroup}>
          {Object.values(AnswerFormat).map((f) => (
            <label key={f} className={styles.radioLabel}>
              <input type="radio" value={f} {...register('format')} />
              {FORMAT_LABELS[f]}
            </label>
          ))}
        </div>
        {errors.format && <p className={styles.errorText}>{errors.format.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="question-count">
          Number of Questions
        </label>
        <input
          id="question-count"
          type="number"
          min={MIN_QUESTION_COUNT}
          max={MAX_QUESTION_COUNT}
          className={styles.countInput}
          {...register('count')}
        />
        <p className={styles.hint}>
          {MIN_QUESTION_COUNT}–{MAX_QUESTION_COUNT} questions
        </p>
        {errors.count && <p className={styles.errorText}>{errors.count.message}</p>}
      </div>

      <Button type="submit" variant="primary" disabled={isDisabled}>
        {isDisabled ? 'Generating…' : 'Generate Quiz'}
      </Button>
    </form>
  );
};
