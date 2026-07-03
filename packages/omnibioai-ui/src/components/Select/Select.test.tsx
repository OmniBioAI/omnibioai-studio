import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

describe('Select', () => {
  it('renders all options', () => {
    render(<Select options={options} value="a" onChange={() => {}} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });
  it('renders label when provided', () => {
    render(<Select options={options} value="a" onChange={() => {}} label="Category" />);
    expect(screen.getByText('Category')).toBeInTheDocument();
  });
  it('calls onChange with selected value', () => {
    const fn = vi.fn();
    render(<Select options={options} value="a" onChange={fn} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(fn).toHaveBeenCalledWith('b');
  });
  it('is disabled when disabled prop is true', () => {
    render(<Select options={options} value="a" onChange={() => {}} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
  it('renders placeholder option', () => {
    render(
      <Select options={options} value="" onChange={() => {}}
              placeholder="Choose one" />
    );
    expect(screen.getByText('Choose one')).toBeInTheDocument();
  });
});
