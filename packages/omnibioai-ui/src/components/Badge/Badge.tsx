import React from 'react';
import './Badge.css';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const cls = variant === 'neutral' ? 'default' : variant;
  return (
    <span className={`omni-badge omni-badge--${cls}`}>
      {children}
    </span>
  );
}
