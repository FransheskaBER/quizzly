import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@skills-trainer/shared';
import type { LoginRequest } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { extractApiError } from '@/hooks/useApiError';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import styles from './LoginPage.module.css';

const LoginPage = () => {
  const { login, resendVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginRequest) => {
    setFormError(null);
    setUnverifiedEmail(null);
    try {
      await login(data);
      navigate(from, { replace: true });
    } catch (err) {
      const { code, message } = extractApiError(err);
      if (code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(data.email);
      } else {
        setFormError(message);
      }
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail || resendStatus !== 'idle') return;
    setResendStatus('sending');
    try {
      await resendVerification(unverifiedEmail);
    } catch {
      // resend always returns 200 on backend — any throw here is a network error
    } finally {
      setResendStatus('sent');
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
          <FormError message={formError} />

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

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.footer}>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
