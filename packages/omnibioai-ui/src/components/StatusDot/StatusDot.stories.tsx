import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusDot } from './StatusDot';

const meta: Meta<typeof StatusDot> = {
  title: 'Components/StatusDot',
  component: StatusDot,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof StatusDot>;

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <StatusDot status="running" label="running (animated)" />
      <StatusDot status="success" label="success" />
      <StatusDot status="failed" label="failed" />
      <StatusDot status="queued" label="queued" />
      <StatusDot status="idle" label="idle" />
    </div>
  ),
};
export const Running: Story = { args: { status: 'running', label: 'Job running' } };
export const Success: Story = { args: { status: 'success', label: 'Complete' } };
export const Failed: Story = { args: { status: 'failed', label: 'Failed' } };
