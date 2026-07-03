import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
  it('calls onClick when clicked', () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('is disabled and shows spinner when loading', () => {
    const { container } = render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(container.querySelector('.omni-spinner')).toBeInTheDocument();
  });
  it('does not call onClick when disabled', () => {
    const fn = vi.fn();
    render(<Button disabled onClick={fn}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(fn).not.toHaveBeenCalled();
  });
  it('applies variant classes', () => {
    const { container } = render(<Button variant="danger">x</Button>);
    expect(container.firstChild).toHaveClass('omni-btn--danger');
  });
  it('applies size classes', () => {
    const { container } = render(<Button size="lg">x</Button>);
    expect(container.firstChild).toHaveClass('omni-btn--lg');
  });
});
