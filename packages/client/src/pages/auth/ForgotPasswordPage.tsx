import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@skills-trainer/shared';
import type { ForgotPasswordRequest } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { parseApiError } from '@/hooks/useApiError';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
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
      const { message } = parseApiError(err);
      setFormError(message);
    }
  };

  if (submittedEmail) {
    return (
      <AuthPageLayout>
        <Card className={styles.card}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✉️</span>
            <h1 className="heading-lg text-center">Check your email</h1>
            <p className="text-sm text-muted">
              If an account exists for{' '}
              <strong>{submittedEmail}</strong>, a reset link has been
              sent.
            </p>
            <p className={`${styles.footer} text-sm text-muted`}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        </Card>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className="heading-xl text-center">Forgot password?</h1>
          <p className="text-sm text-muted text-center">
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

          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>

        <p className={`${styles.footer} text-sm text-muted`}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </Card>
    </AuthPageLayout>
  );
};

export default ForgotPasswordPage;
