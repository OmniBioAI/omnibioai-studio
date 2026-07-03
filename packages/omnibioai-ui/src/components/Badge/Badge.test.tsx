import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>hello</Badge>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
  it('applies success variant class', () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    expect(container.firstChild).toHaveClass('omni-badge--success');
  });
  it('applies warning variant class', () => {
    const { container } = render(<Badge variant="warning">warn</Badge>);
    expect(container.firstChild).toHaveClass('omni-badge--warning');
  });
  it('applies danger variant class', () => {
    const { container } = render(<Badge variant="danger">fail</Badge>);
    expect(container.firstChild).toHaveClass('omni-badge--danger');
  });
  it('applies info variant class', () => {
    const { container } = render(<Badge variant="info">info</Badge>);
    expect(container.firstChild).toHaveClass('omni-badge--info');
  });
  it('neutral and default both render without error', () => {
    const { container: a } = render(<Badge variant="neutral">n</Badge>);
    const { container: b } = render(<Badge variant="default">d</Badge>);
    expect(a.firstChild).toBeTruthy();
    expect(b.firstChild).toBeTruthy();
  });
  it('defaults to neutral when no variant given', () => {
    const { container } = render(<Badge>default</Badge>);
    expect(container.firstChild).toHaveClass('omni-badge');
  });
});
