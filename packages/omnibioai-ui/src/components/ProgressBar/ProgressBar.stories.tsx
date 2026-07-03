import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const AllVariants: Story = {
  render: () => (
    <div style={{ display:'flex', flexDirection:'column', gap:12, width:300 }}>
      <ProgressBar value={100} variant="success" label="100%" />
      <ProgressBar value={97}  variant="success" label="97.2%" />
      <ProgressBar value={60}  variant="accent"  label="60%" />
      <ProgressBar value={30}  variant="warning" label="30%" />
      <ProgressBar value={10}  variant="danger"  label="10%" />
    </div>
  ),
};
export const Sizes: Story = {
  render: () => (
    <div style={{ display:'flex', flexDirection:'column', gap:12, width:300 }}>
      <ProgressBar value={75} size="sm" />
      <ProgressBar value={75} size="md" />
      <ProgressBar value={75} size="lg" />
    </div>
  ),
};
