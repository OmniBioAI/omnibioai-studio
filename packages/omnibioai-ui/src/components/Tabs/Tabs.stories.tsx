import type { Meta, StoryObj } from '@storybook/react';
import { Tabs } from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs tabs={[
      { key: 'arch',   label: 'Architecture', content: <p>Architecture content</p> },
      { key: 'proj',   label: 'Projects',     content: <p>Projects content</p>     },
      { key: 'health', label: 'Health',       content: <p>Health content</p>       },
    ]} />
  ),
};
