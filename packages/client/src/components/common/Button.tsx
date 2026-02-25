import React, { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'md' | 'sm';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    destructive: styles.btnDestructive,
    ghost: styles.btnGhost,
  }[variant];

  const sizeClass = size === 'sm' ? styles.btnSm : '';

  const buttonClasses = [
    styles.btn,
    variantClass,
    sizeClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button className={buttonClasses} {...props}>
      {children}
    </button>
  );
}
