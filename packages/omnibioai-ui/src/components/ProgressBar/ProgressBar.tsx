import './ProgressBar.css';

interface ProgressBarProps {
  value: number;           // 0–100
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'success' | 'danger' | 'warning' | 'accent' | 'info';
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  variant = 'accent',
  showLabel = true,
  label,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const display = label ?? `${Math.round(pct)}%`;

  return (
    <div className="omni-progress-wrap">
      <div className={`omni-progress-track omni-progress-track--${size}`}>
        <div
          className={`omni-progress-fill omni-progress-fill--${variant}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="omni-progress-label">{display}</span>
      )}
    </div>
  );
}
