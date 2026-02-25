import { Link } from 'react-router-dom';
import { useGetDashboardQuery } from '@/api/dashboard.api';
import { parseApiError } from '@/hooks/useApiError';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { FormError } from '@/components/common/FormError';
import { formatScore } from '@/utils/formatters';
import styles from './HomeDashboardPage.module.css';

const HomeDashboardPage = () => {
  const { data, isLoading, error } = useGetDashboardQuery();

  if (isLoading) return <LoadingSpinner fullPage />;

  if (error) {
    const { message } = parseApiError(error);
    return (
      <div className={styles.page}>
        <FormError message={message} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.greeting}>
          {data?.totalSessions === 0 ? 'Welcome' : 'Welcome back'}, {data?.username}
        </h1>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{data?.totalSessions ?? 0}</span>
            <span className={styles.statLabel}>Total Sessions</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{data?.totalQuizzesCompleted ?? 0}</span>
            <span className={styles.statLabel}>Quizzes Completed</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{formatScore(data?.averageScore ?? null)}</span>
            <span className={styles.statLabel}>Average Score</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{data?.mostPracticedSubject ?? '—'}</span>
            <span className={styles.statLabel}>Most Practiced Subject</span>
          </div>
        </div>

        <div className={styles.actions}>
          <Link to="/sessions/new" className={styles.primaryBtn}>
            Create New Session
          </Link>
          <Link to="/sessions" className={styles.sessionsLink}>
            View All Sessions →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HomeDashboardPage;
