import type { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className = '', children }: CardProps) {
  const classes = [styles.card, className].filter(Boolean).join(' ');

  return <div className={classes}>{children}</div>;
}

