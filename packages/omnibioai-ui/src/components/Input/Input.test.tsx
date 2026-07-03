import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders label when provided', () => {
    render(<Input label="Sample ID" value="" onChange={() => {}} />);
    expect(screen.getByText('Sample ID')).toBeInTheDocument();
  });
  it('renders placeholder', () => {
    render(<Input placeholder="Enter value" value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });
  it('calls onChange when typed', () => {
    const fn = vi.fn();
    render(<Input value="" onChange={fn} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('shows error message and error class', () => {
    const { container } = render(
      <Input value="" onChange={() => {}} error="File not found" />
    );
    expect(screen.getByText('File not found')).toBeInTheDocument();
    expect(container.querySelector('.omni-input--error')).toBeInTheDocument();
  });
  it('is disabled when disabled prop is true', () => {
    render(<Input value="" onChange={() => {}} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
