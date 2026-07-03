import { render } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with default props', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.querySelector('.omni-progress-fill')).toBeInTheDocument();
  });
  it('clamps value to 0–100', () => {
    const { container } = render(<ProgressBar value={150} />);
    const fill = container.querySelector('.omni-progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
  it('applies correct variant class', () => {
    const { container } = render(<ProgressBar value={80} variant="success" />);
    expect(container.querySelector('.omni-progress-fill--success')).toBeInTheDocument();
  });
  it('shows percentage label by default', () => {
    const { getByText } = render(<ProgressBar value={75} />);
    expect(getByText('75%')).toBeInTheDocument();
  });
  it('shows custom label when provided', () => {
    const { getByText } = render(<ProgressBar value={75} label="98.7%" />);
    expect(getByText('98.7%')).toBeInTheDocument();
  });
  it('hides label when showLabel is false', () => {
    const { container } = render(<ProgressBar value={75} showLabel={false} />);
    expect(container.querySelector('.omni-progress-label')).toBeNull();
  });
  it('applies size class', () => {
    const { container } = render(<ProgressBar value={50} size="lg" />);
    expect(container.querySelector('.omni-progress-track--lg')).toBeInTheDocument();
  });
});
