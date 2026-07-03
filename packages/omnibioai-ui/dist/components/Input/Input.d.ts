import { default as React } from 'react';
interface InputProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    label?: string;
    error?: string;
    disabled?: boolean;
}
export declare function Input({ value, onChange, placeholder, label, error, disabled }: InputProps): React.JSX.Element;
export {};
