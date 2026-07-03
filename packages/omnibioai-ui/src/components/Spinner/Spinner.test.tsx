import { render } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders with default size', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.omni-spinner--md')).toBeInTheDocument();
  });
  it('applies sm size class', () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container.querySelector('.omni-spinner--sm')).toBeInTheDocument();
  });
  it('applies lg size class', () => {
    const { container } = render(<Spinner size="lg" />);
    expect(container.querySelector('.omni-spinner--lg')).toBeInTheDocument();
  });
  it('applies custom color via style', () => {
    const { container } = render(<Spinner color="#ff0000" />);
    const el = container.querySelector('.omni-spinner') as HTMLElement;
    expect(el.style.borderTopColor).toBe('rgb(255, 0, 0)');
  });
});
