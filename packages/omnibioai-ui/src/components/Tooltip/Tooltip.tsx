import React from 'react';
import './Tooltip.css';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="omni-tooltip-wrap">
      {children}
      <span className="omni-tooltip-box">{content}</span>
    </span>
  );
}
