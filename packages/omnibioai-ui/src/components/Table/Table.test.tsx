import { render, screen, fireEvent } from '@testing-library/react';
import { Table } from './Table';

const cols = [
  { key: 'name' as const, label: 'Name', sortable: true },
  { key: 'code' as const, label: 'Code', sortable: true, align: 'right' as const },
];
const data = [
  { name: 'alpha', code: 300 },
  { name: 'beta',  code: 100 },
  { name: 'gamma', code: 200 },
];

describe('Table', () => {
  it('renders all rows', () => {
    render(<Table columns={cols} data={data} />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('gamma')).toBeInTheDocument();
  });
  it('renders column headers', () => {
    render(<Table columns={cols} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });
  it('shows empty message when no data', () => {
    render(<Table columns={cols} data={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
  it('sorts ascending on header click', () => {
    render(<Table columns={cols} data={data} />);
    fireEvent.click(screen.getByText('Name'));
    const cells = screen.getAllByRole('cell');
    expect(cells[0].textContent).toBe('alpha');
  });
  it('uses custom render function', () => {
    const customCols = [
      { key: 'name' as const, label: 'Name',
        render: (v: unknown) => <strong>{String(v)}</strong> },
    ];
    render(<Table columns={customCols} data={data} />);
    expect(screen.getByText('alpha').tagName).toBe('STRONG');
  });
});
