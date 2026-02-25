import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useGetSessionsQuery } from '@/api/sessions.api';
import { SessionCard } from '@/components/session/SessionCard';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { FormError } from '@/components/common/FormError';
import { parseApiError } from '@/hooks/useApiError';
import type { SessionListItem } from '@skills-trainer/shared';
import styles from './SessionListPage.module.css';

const PAGE_LIMIT = 20;

const SessionListPage = () => {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allSessions, setAllSessions] = useState<SessionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Read cursor via ref inside the data effect to avoid stale closures
  // without adding cursor to the deps array (which would cause duplicate appends).
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const { data, isLoading, isFetching, error } = useGetSessionsQuery({
    cursor,
    limit: PAGE_LIMIT,
  });

  // Accumulate pages: replace on first page / cache invalidation, append on load-more.
  useEffect(() => {
    if (!data) return;
    if (cursorRef.current === undefined) {
      setAllSessions(data.sessions);
    } else {
      setAllSessions((prev) => [...prev, ...data.sessions]);
    }
    setNextCursor(data.nextCursor);
  }, [data]);

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
        <Link to="/dashboard" className={styles.backLink}>
          ← Dashboard
        </Link>

        <div className={styles.header}>
          <h1 className={styles.title}>Study Sessions</h1>
          <Link to="/sessions/new" className={styles.createBtn}>
            Create New Session
          </Link>
        </div>

        {allSessions.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No active sessions</p>
            <Link to="/sessions/new" className={styles.emptyLink}>
              Create New Session
            </Link>
          </div>
        ) : (
          <div className={styles.list}>
            {allSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}

        {nextCursor && (
          <div className={styles.loadMore}>
            {isFetching ? (
              <LoadingSpinner />
            ) : (
              <button
                className={styles.loadMoreBtn}
                onClick={() => setCursor(nextCursor)}
                disabled={isFetching}
              >
                Load More
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionListPage;
