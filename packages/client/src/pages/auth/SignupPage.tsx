import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema } from '@skills-trainer/shared';
import type { SignupRequest } from '@skills-trainer/shared';
import { useAuth } from '@/hooks/useAuth';
import { extractApiError } from '@/hooks/useApiError';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import styles from './SignupPage.module.css';

const SignupPage = () => {
  const { signup } = useAuth();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupRequest>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (data: SignupRequest) => {
    setFormError(null);
    try {
      await signup(data);
      setSubmittedEmail(data.email);
    } catch (err) {
      const { code, message } = extractApiError(err);
      if (code === 'CONFLICT') {
        setError('email', { message: 'Email already registered' });
      } else if (code === 'RATE_LIMITED') {
        setFormError('Too many attempts. Please try again later.');
      } else {
        setFormError(message);
      }
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
              We sent a verification link to{' '}
              <span className={styles.successEmail}>{submittedEmail}</span>.
              <br />
              Click the link to activate your account.
            </p>
            <p className={styles.footer}>
              Already verified? <Link to="/login">Sign in</Link>
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
          <h1 className={styles.title}>Create account</h1>
          <p className={styles.subtitle}>Start training your engineering skills</p>
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

          <FormField
            id="username"
            label="Username"
            type="text"
            autoComplete="username"
            placeholder="yourname"
            error={errors.username?.message}
            {...register('username')}
          />

          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={errors.password?.message}
            {...register('password')}
          />

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
