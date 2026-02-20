import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { SessionListItem } from '@skills-trainer/shared';
import { formatDate } from '@/utils/formatters';
import styles from './SessionCard.module.css';

interface SessionCardProps {
  session: SessionListItem;
}

export const SessionCard = memo(({ session }: SessionCardProps) => {
  return (
    <Link to={`/sessions/${session.id}`} className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{session.name}</h3>
        <span className={styles.subject}>{session.subject}</span>
      </div>
      <p className={styles.goal}>{session.goal}</p>
      <div className={styles.meta}>
        <span>{session.materialCount} material{session.materialCount !== 1 ? 's' : ''}</span>
        <span>{session.quizCount} quiz{session.quizCount !== 1 ? 'zes' : ''}</span>
        <span>{formatDate(session.createdAt)}</span>
      </div>
    </Link>
  );
});

SessionCard.displayName = 'SessionCard';
