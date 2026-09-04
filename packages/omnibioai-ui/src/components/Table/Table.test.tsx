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

it('cycles sort direction, handles nulls, and resets after a third click', () => {
  const columns = [
    { key: 'name' as const, label: 'Name', sortable: true },
    { key: 'value' as const, label: 'Value', sortable: true },
    { key: 'plain' as const, label: 'Plain', sortable: false },
  ];
  const rows = [
    { name: 'zeta', value: null as number | null, plain: 'x' },
    { name: 'alpha', value: 2, plain: 'y' },
    { name: 'beta', value: 1, plain: 'z' },
  ];
  render(<Table columns={columns} data={rows} />);
  const name = screen.getByText('Name');
  fireEvent.click(name); // asc
  fireEvent.click(name); // desc
  expect(screen.getAllByRole('cell')[0]).toHaveTextContent('zeta');
  fireEvent.click(name); // clear sort
  expect(screen.getAllByRole('cell')[0]).toHaveTextContent('zeta');
  fireEvent.click(screen.getByText('Plain')); // no-op
});

it('compares nulls on both sides and equal values when sorting', () => {
  const columns = [{ key: 'value' as const, label: 'Value', sortable: true }];
  const rows = [
    { value: null as number | null },
    { value: 5 },
    { value: 5 },
    { value: 3 },
  ];
  render(<Table columns={columns} data={rows} />);
  fireEvent.click(screen.getByText('Value')); // ascending
  const asc = screen.getAllByRole('cell').map(c => c.textContent);
  expect(asc[asc.length - 1]).toBe('—'); // null sorts last ascending
  fireEvent.click(screen.getByText('Value')); // descending
  const desc = screen.getAllByRole('cell').map(c => c.textContent);
  expect(desc[desc.length - 1]).toBe('—'); // null comparator return bypasses the direction flip
});

it('re-sorts ascending on the same column after a full reset cycle', () => {
  const columns = [{ key: 'name' as const, label: 'Name', sortable: true }];
  const rows = [{ name: 'zeta' }, { name: 'alpha' }, { name: 'beta' }];
  render(<Table columns={columns} data={rows} />);
  const name = screen.getByText('Name');
  fireEvent.click(name); // asc
  fireEvent.click(name); // desc
  fireEvent.click(name); // reset (null)
  fireEvent.click(name); // asc again
  expect(screen.getAllByRole('cell')[0]).toHaveTextContent('alpha');
});

it('paginates, renders ellipses, and supports page navigation', () => {
  const columns = [{ key: 'name' as const, label: 'Name', sortable: true }];
  const rows = Array.from({ length: 50 }, (_, i) => ({ name: `row-${i}` }));
  render(<Table columns={columns} data={rows} pageSize={2} />);
  expect(screen.getByText('row-0')).toBeInTheDocument();
  expect(screen.getByText('…')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  expect(screen.getByText('row-2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '→' }));
  fireEvent.click(screen.getByRole('button', { name: '←' }));
  expect(screen.getByText('row-2')).toBeInTheDocument();
});
