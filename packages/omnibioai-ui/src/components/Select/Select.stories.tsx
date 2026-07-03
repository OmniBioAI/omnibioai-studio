import type { Meta, StoryObj } from '@storybook/react';
import { Select } from './Select';

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Select>;

const categoryOptions = [
  { value: 'all',       label: 'All categories' },
  { value: 'core',      label: 'Core'            },
  { value: 'sdk',       label: 'SDK / Clients'   },
  { value: 'execution', label: 'Execution'       },
  { value: 'security',  label: 'Security'        },
  { value: 'infra',     label: 'Infrastructure'  },
];

export const Default: Story = {
  args: { options: categoryOptions, value: 'all', onChange: () => {}, label: 'Category' },
};
export const WithPlaceholder: Story = {
  args: { options: categoryOptions, value: '', onChange: () => {},
          placeholder: 'Select a category' },
};
export const Disabled: Story = {
  args: { options: categoryOptions, value: 'core', onChange: () => {}, disabled: true },
};
