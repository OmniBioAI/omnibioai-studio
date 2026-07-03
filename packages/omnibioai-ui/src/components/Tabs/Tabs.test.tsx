import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from './Tabs';

const tabs = [
  { key: 'a', label: 'Tab A', content: <div>Content A</div> },
  { key: 'b', label: 'Tab B', content: <div>Content B</div> },
  { key: 'c', label: 'Tab C', content: <div>Content C</div> },
];

describe('Tabs', () => {
  it('renders all tab labels', () => {
    render(<Tabs tabs={tabs} />);
    expect(screen.getByText('Tab A')).toBeInTheDocument();
    expect(screen.getByText('Tab B')).toBeInTheDocument();
    expect(screen.getByText('Tab C')).toBeInTheDocument();
  });
  it('shows first tab content by default', () => {
    render(<Tabs tabs={tabs} />);
    expect(screen.getByText('Content A')).toBeInTheDocument();
  });
  it('switches content on tab click', () => {
    render(<Tabs tabs={tabs} />);
    fireEvent.click(screen.getByText('Tab B'));
    expect(screen.getByText('Content B')).toBeInTheDocument();
  });
  it('calls onChange with correct key', () => {
    const fn = vi.fn();
    render(<Tabs tabs={tabs} onChange={fn} />);
    fireEvent.click(screen.getByText('Tab C'));
    expect(fn).toHaveBeenCalledWith('c');
  });
  it('respects defaultTab prop', () => {
    render(<Tabs tabs={tabs} defaultTab="b" />);
    expect(screen.getByText('Content B')).toBeInTheDocument();
  });
});
