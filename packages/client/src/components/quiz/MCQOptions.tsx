import ReactMarkdown from 'react-markdown';

import styles from './MCQOptions.module.css';

interface MCQOptionsProps {
  options: string[];
  selectedOption: string | null;
  onSelect: (option: string) => void;
}

export const MCQOptions = ({ options, selectedOption, onSelect }: MCQOptionsProps) => (
  <div className={styles.options}>
    {options.map((option, index) => {
      const isSelected = option === selectedOption;
      const label = String.fromCharCode(65 + index);
      const inputId = `option-${option}`;
      return (
        <label
          key={option}
          htmlFor={inputId}
          className={`${styles.option} ${isSelected ? styles.selected : ''}`}
        >
          <input
            id={inputId}
            type="radio"
            name="mcq-option"
            value={option}
            checked={isSelected}
            onChange={() => onSelect(option)}
            className={styles.radioInput}
          />
          <span className={styles.optionLabel}>{label}.</span>
          <span className={styles.optionText}>
            <ReactMarkdown>{option}</ReactMarkdown>
          </span>
        </label>
      );
    })}
  </div>
);
