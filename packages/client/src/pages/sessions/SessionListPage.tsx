import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useGetSessionsQuery } from '@/api/sessions.api';
import { SessionCard } from '@/components/session/SessionCard';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { FormError } from '@/components/common/FormError';
import { Button } from '@/components/common/Button';
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

  // Tracks whether the pending data change is an explicit load-more vs a
  // fresh fetch or cache-invalidation refetch. Without this, a Session:LIST
  // cache invalidation while the user is on page N > 1 would refetch the
  // page-N query and append its results, duplicating sessions already shown.
  const isLoadMoreRef = useRef(false);

  const { data, isLoading, isFetching, error } = useGetSessionsQuery({
    cursor,
    limit: PAGE_LIMIT,
  });

  // Accumulate pages: append on explicit load-more, replace otherwise.
  // If a cache invalidation fires while we're on page N > 1, reset cursor
  // to undefined so the list refetches from page 1.
  useEffect(() => {
    if (!data) return;
    if (isLoadMoreRef.current) {
      isLoadMoreRef.current = false;
      setAllSessions((prev) => [...prev, ...data.sessions]);
    } else if (cursorRef.current !== undefined) {
      // Cache-invalidation refetch of a non-first page — reset to page 1.
      setCursor(undefined);
      return;
    } else {
      setAllSessions(data.sessions);
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
            <Button
              variant="secondary"
              onClick={() => {
                isLoadMoreRef.current = true;
                setCursor(nextCursor);
              }}
              disabled={isFetching}
            >
              Load More
            </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionListPage;
