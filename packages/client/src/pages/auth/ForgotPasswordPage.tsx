import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@skills-trainer/shared';
import type { ForgotPasswordRequest } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { parseApiError } from '@/hooks/useApiError';
import { useToast } from '@/hooks/useToast';
import { extractHttpStatus, getUserMessage } from '@/utils/error-messages';
import { Sentry } from '@/config/sentry';
import { toSentryError } from '@/utils/sentry.utils';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import styles from './ForgotPasswordPage.module.css';

const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth();
  const { showError } = useToast();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordRequest) => {
    try {
      await forgotPassword(data.email);
      setSubmittedEmail(data.email);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Forgot password request failed:', err);
      Sentry.captureException(toSentryError(err, 'forgot password failed'), {
        extra: {
          operation: 'forgotPassword',
          email: data.email,
          originalError: err,
        },
      });
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, 'forgot-password', status);
      showError(userMessage.title, userMessage.description);
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
