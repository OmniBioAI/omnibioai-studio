import './Spinner.css';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export function Spinner({ size = 'md', color }: SpinnerProps) {
  return (
    <span
      className={`omni-spinner omni-spinner--${size}`}
      style={color ? { borderTopColor: color } : undefined}
    />
  );
}
