import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@skills-trainer/shared';
import type { ForgotPasswordRequest } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { extractApiError } from '@/hooks/useApiError';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import styles from './ForgotPasswordPage.module.css';

const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordRequest) => {
    setFormError(null);
    try {
      await forgotPassword(data.email);
      setSubmittedEmail(data.email);
    } catch (err) {
      const { message } = extractApiError(err);
      setFormError(message);
    }
  };

  if (submittedEmail) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✉️</span>
            <h1 className={styles.successTitle}>Check your email</h1>
            <p className={styles.successText}>
              If an account exists for{' '}
              <span className={styles.successEmail}>{submittedEmail}</span>, a reset link has been
              sent.
            </p>
            <p className={styles.footer}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Forgot password?</h1>
          <p className={styles.subtitle}>
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormError message={formError} />

          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className={styles.footer}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
