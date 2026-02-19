import React from 'react';
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
  ({ label, error, id, className, ...rest }, ref) => (
    <div className={`${styles.field} ${className ?? ''}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input ref={ref} id={id} className={`${styles.input} ${error ? styles.inputError : ''}`} {...rest} />
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  ),
);

FormField.displayName = 'FormField';
