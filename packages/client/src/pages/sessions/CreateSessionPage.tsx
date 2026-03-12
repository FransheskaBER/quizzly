import { Link, useNavigate } from 'react-router-dom';
import { useCreateSessionMutation } from '@/api/sessions.api';
import { SessionForm } from '@/components/session/SessionForm';
import { parseApiError } from '@/hooks/useApiError';
import { useToast } from '@/hooks/useToast';
import { extractHttpStatus, getUserMessage } from '@/utils/error-messages';
import { Sentry } from '@/config/sentry';
import type { CreateSessionRequest } from '@skills-trainer/shared';
import styles from './CreateSessionPage.module.css';

const CreateSessionPage = () => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [createSession, { isLoading }] = useCreateSessionMutation();

  const handleSubmit = async (data: CreateSessionRequest) => {
    try {
      const result = await createSession(data).unwrap();
      showSuccess('Created your session', `"${result.name}" is ready to go.`);
      navigate(`/sessions/${result.id}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Create session failed:', err);
      Sentry.captureException(err, { extra: { operation: 'createSession' } });
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, 'create-session', status);
      showError(userMessage.title, userMessage.description);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/dashboard" className={styles.backLink}>← Dashboard</Link>
      </div>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create Session</h1>
          <p className={styles.subtitle}>Set up a new study session around a subject and goal.</p>
        </div>
        <SessionForm
          mode="create"
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default CreateSessionPage;
