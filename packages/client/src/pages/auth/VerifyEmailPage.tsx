import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVerifyEmailMutation } from '@/api/auth.api';
import { extractApiError } from '@/hooks/useApiError';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import styles from './VerifyEmailPage.module.css';

type VerifyState = 'loading' | 'success' | 'error' | 'no-token';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Use the mutation trigger directly — RTK Query guarantees a stable reference,
  // so it can go in the useEffect dep array without causing repeated calls.
  const [verifyEmail] = useVerifyEmailMutation();

  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'no-token');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const verify = async () => {
      try {
        await verifyEmail({ token }).unwrap();
        if (!cancelled) setState('success');
      } catch (err) {
        if (!cancelled) {
          const { message } = extractApiError(err);
          setErrorMessage(message);
          setState('error');
        }
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail]);

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
