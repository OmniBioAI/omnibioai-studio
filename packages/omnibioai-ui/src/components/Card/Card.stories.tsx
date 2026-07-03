import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';
import { Badge } from '../Badge/Badge';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  args: { children: 'Plugin output: run completed in 4.2s' },
};
export const WithTitle: Story = {
  args: { title: 'Analysis result', children: 'Run completed in 4.2s' },
};
export const WithActions: Story = {
  args: {
    title: 'Job status',
    actions: <Badge variant="success">Running</Badge>,
    children: 'Started 2 minutes ago',
  },
};
export const Elevated: Story = {
  args: { elevated: true, children: 'Elevated card' },
};
export const Clickable: Story = {
  args: { onClick: () => alert('clicked'), children: 'Click me' },
};
