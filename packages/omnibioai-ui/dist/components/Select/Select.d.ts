export interface SelectOption {
    value: string;
    label: string;
}
interface SelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    disabled?: boolean;
    placeholder?: string;
}
export declare function Select({ options, value, onChange, label, disabled, placeholder, }: SelectProps): import("react").JSX.Element;
export {};
