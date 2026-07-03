import { default as React } from 'react';
interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
}
export declare function Button({ variant, size, disabled, loading, onClick, children }: ButtonProps): React.JSX.Element;
export {};
