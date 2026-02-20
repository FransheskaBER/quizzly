import styles from './FormError.module.css';

interface FormErrorProps {
  message: string | null;
}

/**
 * Displays a non-field-level error (e.g. "Invalid email or password").
 * Renders nothing when message is null.
 */
export const FormError = ({ message }: FormErrorProps) => {
  if (!message) return null;
  return <p className={styles.error}>{message}</p>;
};
