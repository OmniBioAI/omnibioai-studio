import './StatusDot.css';

type Status = 'running' | 'success' | 'failed' | 'queued' | 'idle';

interface StatusDotProps {
  status: Status;
  label?: string;
}

const STATUS_CLASS: Record<Status, string> = {
  running: 'omni-status-dot--up omni-status-dot--pulse',
  success: 'omni-status-dot--up',
  failed:  'omni-status-dot--down',
  queued:  'omni-status-dot--warn',
  idle:    'omni-status-dot--init',
};

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span className="omni-status-dot-wrap">
      <span className={`omni-status-dot ${STATUS_CLASS[status]}`} />
      {label && <span className="omni-status-dot-label">{label}</span>}
    </span>
  );
}
