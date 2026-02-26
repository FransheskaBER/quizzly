import { Link, useNavigate } from 'react-router-dom';
import { useCreateSessionMutation } from '@/api/sessions.api';
import { SessionForm } from '@/components/session/SessionForm';
import { parseApiError } from '@/hooks/useApiError';
import type { CreateSessionRequest } from '@skills-trainer/shared';
import styles from './CreateSessionPage.module.css';

const CreateSessionPage = () => {
  const navigate = useNavigate();
  const [createSession, { isLoading, error }] = useCreateSessionMutation();

  const handleSubmit = async (data: CreateSessionRequest) => {
    const result = await createSession(data).unwrap();
    navigate(`/sessions/${result.id}`);
  };

  const { message: errorMessage } = error ? parseApiError(error) : { message: undefined };

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
          error={errorMessage}
        />
      </div>
    </div>
  );
};

export default CreateSessionPage;
