import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { useApiError } from '@/hooks/useApiError';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import styles from './ResetPasswordPage.module.css';

// Client-side schema: password + confirmPassword (token comes from URL, not the form)
const resetFormSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetFormData = z.infer<typeof resetFormSchema>;

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();
  const token = searchParams.get('token');

  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({ resolver: zodResolver(resetFormSchema) });

  const onSubmit = async (data: ResetFormData) => {
    if (!token) return;
    setFormError(null);
    try {
      await resetPassword({ token, password: data.password });
      setSuccess(true);
    } catch (err) {
      const { message } = useApiError(err);
      setFormError(message);
    }
  };

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.errorBox}>
            <span className={styles.errorIcon}>❌</span>
            <h1 className={styles.errorTitle}>Invalid reset link</h1>
            <p className={styles.footer}>
              <Link to="/forgot-password">Request a new reset link</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✅</span>
            <h1 className={styles.successTitle}>Password reset!</h1>
            <p className={styles.successText}>You can now sign in with your new password.</p>
            <Link to="/login">Go to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Reset password</h1>
          <p className={styles.subtitle}>Enter your new password below.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormError message={formError} />

          <FormField
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={errors.password?.message}
            {...register('password')}
          />

          <FormField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your new password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <p className={styles.footer}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
