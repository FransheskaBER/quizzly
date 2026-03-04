import type { ComponentPropsWithoutRef } from 'react';
import styles from './Card.module.css';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {}

export function Card({ className = '', children, ...rest }: CardProps) {
  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
