import { render } from '@testing-library/react';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('renders without label', () => {
    const { container } = render(<StatusDot status="success" />);
    expect(container.querySelector('.omni-status-dot')).toBeInTheDocument();
  });
  it('renders label when provided', () => {
    const { getByText } = render(<StatusDot status="success" label="UP" />);
    expect(getByText('UP')).toBeInTheDocument();
  });
  it('applies up class for success', () => {
    const { container } = render(<StatusDot status="success" />);
    expect(container.querySelector('.omni-status-dot--up')).toBeInTheDocument();
  });
  it('applies down class for failed', () => {
    const { container } = render(<StatusDot status="failed" />);
    expect(container.querySelector('.omni-status-dot--down')).toBeInTheDocument();
  });
  it('applies pulse class for running', () => {
    const { container } = render(<StatusDot status="running" />);
    expect(container.querySelector('.omni-status-dot--pulse')).toBeInTheDocument();
  });
  it('applies warn class for queued', () => {
    const { container } = render(<StatusDot status="queued" />);
    expect(container.querySelector('.omni-status-dot--warn')).toBeInTheDocument();
  });
  it('applies init class for idle', () => {
    const { container } = render(<StatusDot status="idle" />);
    expect(container.querySelector('.omni-status-dot--init')).toBeInTheDocument();
  });
});
