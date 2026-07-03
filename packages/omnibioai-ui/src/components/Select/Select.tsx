import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function Select({
  options, value, onChange, label, disabled, placeholder,
}: SelectProps) {
  return (
    <div className="omni-select-group">
      {label && <label className="omni-select-label">{label}</label>}
      <select
        className="omni-select"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      >
        {placeholder && (
          <option value="" disabled>{placeholder}</option>
        )}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
