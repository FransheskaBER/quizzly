import styles from './FreeTextInput.module.css';

interface FreeTextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export const FreeTextInput = ({ value, onChange }: FreeTextInputProps) => (
  <textarea
    className={styles.textarea}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Type your answer here..."
    rows={6}
    aria-label="Answer"
  />
);
