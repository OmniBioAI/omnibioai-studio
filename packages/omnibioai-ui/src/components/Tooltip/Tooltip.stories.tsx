import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from './Tooltip';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const OnBadge: Story = {
  render: () => (
    <div style={{ padding: 40 }}>
      <Tooltip content="27/27 services healthy">
        <Badge variant="success">UP</Badge>
      </Tooltip>
    </div>
  ),
};
export const OnButton: Story = {
  render: () => (
    <div style={{ padding: 40 }}>
      <Tooltip content="Regenerate the ecosystem report">
        <Button variant="primary">Regenerate</Button>
      </Tooltip>
    </div>
  ),
};
