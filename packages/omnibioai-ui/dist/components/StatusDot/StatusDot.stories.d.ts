import { Meta, StoryObj } from '@storybook/react-vite';
import { StatusDot } from './StatusDot';
declare const meta: Meta<typeof StatusDot>;
export default meta;
type Story = StoryObj<typeof StatusDot>;
export declare const AllStatuses: Story;
export declare const Running: Story;
export declare const Success: Story;
export declare const Failed: Story;
