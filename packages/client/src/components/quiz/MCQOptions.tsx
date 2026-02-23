import ReactMarkdown from 'react-markdown';

import styles from './MCQOptions.module.css';

interface MCQOptionsProps {
  options: string[];
  selectedOption: string | null;
  onSelect: (option: string) => void;
}

export const MCQOptions = ({ options, selectedOption, onSelect }: MCQOptionsProps) => (
  <div className={styles.options} role="radiogroup">
    {options.map((option, index) => {
      const isSelected = option === selectedOption;
      const label = String.fromCharCode(65 + index);
      return (
        <button
          key={index}
          type="button"
          role="radio"
          aria-checked={isSelected}
          aria-label={`Option ${label}: ${option}`}
          className={`${styles.option} ${isSelected ? styles.selected : ''}`}
          onClick={() => {
            if (!isSelected) onSelect(option);
          }}
        >
          <span className={styles.optionLabel}>{label}.</span>
          <span className={styles.optionText}>
            <ReactMarkdown>{option}</ReactMarkdown>
          </span>
        </button>
      );
    })}
  </div>
);
