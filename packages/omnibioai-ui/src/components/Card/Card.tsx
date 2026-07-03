import React from 'react';
import './Card.css';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  padding?: string;
  elevated?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, title, actions, padding, elevated, onClick, className }: CardProps) {
  const classes = [
    'omni-card',
    elevated ? 'omni-card--elevated' : '',
    onClick   ? 'omni-card--clickable' : '',
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={padding ? { padding } : undefined} onClick={onClick}>
      {(title || actions) && (
        <div className="omni-card__header">
          {title   && <div className="omni-card__title">{title}</div>}
          {actions && <div className="omni-card__actions">{actions}</div>}
        </div>
      )}
      <div className="omni-card__body">{children}</div>
    </div>
  );
}
