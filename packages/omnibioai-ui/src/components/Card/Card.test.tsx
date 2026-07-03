import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>content</Card>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
  it('renders title when provided', () => {
    render(<Card title="My Card">body</Card>);
    expect(screen.getByText('My Card')).toBeInTheDocument();
  });
  it('does not render header when no title or actions', () => {
    const { container } = render(<Card>body</Card>);
    expect(container.querySelector('.omni-card__header')).toBeNull();
  });
  it('applies elevated class', () => {
    const { container } = render(<Card elevated>body</Card>);
    expect(container.firstChild).toHaveClass('omni-card--elevated');
  });
  it('applies clickable class and calls onClick', () => {
    const fn = vi.fn();
    const { container } = render(<Card onClick={fn}>body</Card>);
    expect(container.firstChild).toHaveClass('omni-card--clickable');
    fireEvent.click(container.firstChild!);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
