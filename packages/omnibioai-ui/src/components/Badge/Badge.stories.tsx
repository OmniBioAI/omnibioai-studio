import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge variant="success">success</Badge>
      <Badge variant="warning">warning</Badge>
      <Badge variant="danger">danger</Badge>
      <Badge variant="info">info</Badge>
      <Badge variant="neutral">neutral</Badge>
      <Badge variant="default">default</Badge>
    </div>
  ),
};
export const Success: Story = { args: { children: 'Running', variant: 'success' } };
export const Warning: Story = { args: { children: 'Queued', variant: 'warning' } };
export const Danger: Story = { args: { children: 'Failed', variant: 'danger' } };
export const Info: Story = { args: { children: 'v1.0.0', variant: 'info' } };
export const Neutral: Story = { args: { children: 'Draft', variant: 'neutral' } };
