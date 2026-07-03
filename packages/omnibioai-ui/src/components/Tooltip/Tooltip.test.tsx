import { render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders children', () => {
    render(<Tooltip content="tip text"><span>hover me</span></Tooltip>);
    expect(screen.getByText('hover me')).toBeInTheDocument();
  });
  it('renders tooltip content in DOM', () => {
    render(<Tooltip content="tip text"><span>target</span></Tooltip>);
    expect(screen.getByText('tip text')).toBeInTheDocument();
  });
  it('tooltip box has correct class', () => {
    const { container } = render(
      <Tooltip content="tip"><span>x</span></Tooltip>
    );
    expect(container.querySelector('.omni-tooltip-box')).toBeInTheDocument();
  });
});
