import { default as React } from 'react';
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';
interface BadgeProps {
    variant?: BadgeVariant;
    children: React.ReactNode;
}
export declare function Badge({ variant, children }: BadgeProps): React.JSX.Element;
export {};
