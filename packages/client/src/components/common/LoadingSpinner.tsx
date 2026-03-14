import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  fullPage?: boolean;
  inline?: boolean;
  size?: 'sm' | 'md';
}

export const LoadingSpinner = ({ fullPage = false, inline = false, size = 'md' }: LoadingSpinnerProps) => {
  const spinnerClass = `${styles.spinner} ${size === 'sm' ? styles.spinnerSm : ''}`;

  if (inline) {
    return <span className={spinnerClass} />;
  }

  return (
    <div className={`${styles.container} ${fullPage ? styles.fullPage : ''}`}>
      <div className={spinnerClass} />
    </div>
  );
};
