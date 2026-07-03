import React from 'react';
import './Input.css';

interface InputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function Input({ value, onChange, placeholder, label, error, disabled }: InputProps) {
  return (
    <div className="omni-input-group">
      {label && <label className="omni-input-label">{label}</label>}
      <input
        className={`omni-input${error ? ' omni-input--error' : ''}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error && <div className="omni-input-error">{error}</div>}
    </div>
  );
}
