import { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';
declare const meta: Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof Input>;
export declare const Default: Story;
export declare const WithError: Story;
export declare const Disabled: Story;
