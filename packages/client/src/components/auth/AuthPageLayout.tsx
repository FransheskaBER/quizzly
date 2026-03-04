import type { ReactNode } from 'react';
import styles from './AuthPageLayout.module.css';

export interface AuthPageLayoutProps {
  children: ReactNode;
}

export function AuthPageLayout({ children }: AuthPageLayoutProps) {
  return <div className={styles.page}>{children}</div>;
}

