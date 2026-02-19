import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useApiError } from '@/hooks/useApiError';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import styles from './VerifyEmailPage.module.css';

type VerifyState = 'loading' | 'success' | 'error' | 'no-token';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'no-token');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const verify = async () => {
      try {
        await verifyEmail(token);
        if (!cancelled) setState('success');
      } catch (err) {
        if (!cancelled) {
          const { message } = useApiError(err);
          setErrorMessage(message);
          setState('error');
        }
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <LoadingSpinner />
          <p className={styles.text}>Verifying your email…</p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <span className={styles.icon}>✅</span>
          <h1 className={styles.title}>Email verified!</h1>
          <p className={styles.text}>Your account is active. You can now sign in.</p>
          <Link to="/login">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (state === 'no-token') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <span className={styles.icon}>❌</span>
          <h1 className={styles.title}>Invalid verification link</h1>
          <p className={styles.text}>
            This link is missing a token. Check your email for the correct verification link.
          </p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  // state === 'error'
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon}>❌</span>
        <h1 className={styles.title}>Verification failed</h1>
        <p className={styles.errorText}>{errorMessage}</p>
        <p className={styles.text}>
          Need a new link? <Link to="/signup">Sign up again</Link> or{' '}
          <Link to="/login">go to sign in</Link>.
        </p>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
