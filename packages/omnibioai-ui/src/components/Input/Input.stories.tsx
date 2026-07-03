import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { label: 'Sample ID', placeholder: 'Enter sample identifier', value: '', onChange: () => {} },
};
export const WithError: Story = {
  args: { label: 'VCF path', value: '/bad/path', error: 'File not found', onChange: () => {} },
};
export const Disabled: Story = {
  args: { label: 'Read only', value: 'locked value', disabled: true, onChange: () => {} },
};
