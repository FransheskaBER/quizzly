import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSessionSchema } from '@skills-trainer/shared';
import type { CreateSessionRequest } from '@skills-trainer/shared';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import styles from './SessionForm.module.css';

interface SessionFormProps {
  mode: 'create' | 'edit';
  defaultValues?: CreateSessionRequest;
  onSubmit: (data: CreateSessionRequest) => void | Promise<void>;
  onCancel?: () => void;
  isLoading: boolean;
  error?: string;
}

export const SessionForm = ({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: SessionFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateSessionRequest>({
    resolver: zodResolver(createSessionSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
      <FormError message={error ?? null} />

      <FormField
        label="Session name"
        type="text"
        placeholder="e.g., React Fundamentals"
        error={errors.name?.message}
        {...register('name')}
      />

      <FormField
        label="Subject area"
        type="text"
        placeholder="e.g., Frontend Development"
        error={errors.subject?.message}
        {...register('subject')}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="session-goal">
          Study goal
        </label>
        <textarea
          id="session-goal"
          className={`${styles.textarea} ${errors.goal ? styles.textareaError : ''}`}
          placeholder="What do you want to achieve?"
          rows={4}
          {...register('goal')}
        />
        {errors.goal && <p className={styles.errorText}>{errors.goal.message}</p>}
      </div>

      <div className={styles.actions}>
        {mode === 'edit' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={styles.cancelBtn}
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submitBtn} disabled={isLoading}>
          {isLoading
            ? mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : mode === 'create'
              ? 'Create Session'
              : 'Save Changes'}
        </button>
      </div>
    </form>
  );
};
