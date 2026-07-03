import React from 'react';
import './Button.css';
import { Spinner } from '../Spinner/Spinner';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', disabled, loading, onClick, children }: ButtonProps) {
  return (
    <button
      className={`omni-btn omni-btn--${variant} omni-btn--${size}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
