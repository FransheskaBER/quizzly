import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@skills-trainer/shared';
import type { LoginRequest } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { parseApiError } from '@/hooks/useApiError';
import { useToast } from '@/hooks/useToast';
import { extractHttpStatus, getUserMessage } from '@/utils/error-messages';
import { Sentry } from '@/config/sentry';
import { toSentryError } from '@/utils/sentry.utils';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/common/Button';
import styles from './LoginPage.module.css';

const LoginPage = () => {
  const { login, resendVerification } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard';

  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginRequest) => {
    setUnverifiedEmail(null);
    try {
      await login(data);
      navigate(from, { replace: true });
    } catch (err) {
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      // eslint-disable-next-line no-console
      console.error('Login failed:', err);
      Sentry.captureException(toSentryError(err, 'login failed'), {
        extra: {
          operation: 'login',
          email: data.email,
          code,
          status: status ?? null,
          originalError: err,
        },
      });
      if (code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(data.email);
      } else {
        const userMessage = getUserMessage(code, 'login', status);
        showError(userMessage.title, userMessage.description);
      }
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail || resendStatus !== 'idle') return;
    setResendStatus('sending');
    try {
      await resendVerification(unverifiedEmail);
      setResendStatus('sent');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to resend verification email:', err);
      Sentry.captureException(toSentryError(err, 'resend verification failed'), {
        extra: {
          operation: 'resendVerification',
          email: unverifiedEmail,
          originalError: err,
        },
      });
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, 'resend-verification', status);
      showError(userMessage.title, userMessage.description);
      setResendStatus('idle');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to your account</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          {unverifiedEmail && (
            <div className={styles.resendBox}>
              <span>Please verify your email before logging in.</span>
              {resendStatus === 'sent' ? (
                <span>Verification email sent — check your inbox.</span>
              ) : (
                <button
                  type="button"
                  className={styles.resendButton}
                  onClick={handleResend}
                  disabled={resendStatus === 'sending'}
                >
                  {resendStatus === 'sending' ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />

          <div className={styles.formLinks}>
            <span />
            <Link to="/forgot-password">Forgot your password?</Link>
          </div>

          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className={styles.footer}>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
