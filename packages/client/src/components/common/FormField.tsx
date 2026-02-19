import React, { useId } from 'react';
import styles from './FormField.module.css';

interface FormFieldProps extends React.ComponentPropsWithRef<'input'> {
  label: string;
  error?: string;
}

/**
 * Labeled input field for React Hook Form.
 * Usage: <FormField label="Email" type="email" {...register('email')} error={errors.email?.message} />
 */
export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, id: idProp, className, ...rest }, ref) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const errorId = `${id}-error`;

    return (
      <div className={`${styles.field} ${className ?? ''}`}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {error && <p id={errorId} className={styles.errorText}>{error}</p>}
      </div>
    );
  },
);

FormField.displayName = 'FormField';
