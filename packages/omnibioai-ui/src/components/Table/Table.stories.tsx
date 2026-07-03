import type { Meta, StoryObj } from '@storybook/react';
import { Table } from './Table';
import { Badge } from '../Badge/Badge';

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Table>;

const repoData = [
  { repo: 'omnibioai',        category: 'core',      files: 1842, code: 407347, pct: 25.0 },
  { repo: 'workflow-bundles', category: 'core',      files: 623,  code: 218904, pct: 13.4 },
  { repo: 'studio',           category: 'sdk',       files: 412,  code: 185211, pct: 11.4 },
  { repo: 'tes',              category: 'execution', files: 289,  code: 142088, pct: 8.7  },
  { repo: 'control-center',   category: 'infra',     files: 74,   code: 18420,  pct: 1.1  },
];

export const Default: Story = {
  render: () => (
    <Table
      columns={[
        { key: 'repo',     label: 'Repository', sortable: true },
        { key: 'category', label: 'Category',   sortable: true,
          render: (v) => <Badge variant="neutral">{String(v)}</Badge> },
        { key: 'files',    label: 'Files',      sortable: true, align: 'right' },
        { key: 'code',     label: 'Code',       sortable: true, align: 'right',
          render: (v) => Number(v).toLocaleString() },
      ]}
      data={repoData}
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <Table columns={[{ key: 'repo', label: 'Repo' }]}
           data={[]} emptyMessage="No repositories found" />
  ),
};
