import React from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import styles from './Button.module.css';

interface ButtonBaseProps {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'md' | 'sm';
  className?: string;
}

export interface ButtonProps extends ButtonBaseProps, ButtonHTMLAttributes<HTMLButtonElement> {
  to?: undefined;
}

interface LinkButtonProps extends ButtonBaseProps {
  to: string;
  children: React.ReactNode;
}

export function Button(props: ButtonProps | LinkButtonProps): React.ReactElement {
  const {
    variant = 'primary',
    size = 'md',
    className = '',
    children,
    to,
    ...rest
  } = props;

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

  if (to) {
    return (
      <Link to={to} className={buttonClasses}>
        {children}
      </Link>
    );
  }

  return (
    <button className={buttonClasses} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
