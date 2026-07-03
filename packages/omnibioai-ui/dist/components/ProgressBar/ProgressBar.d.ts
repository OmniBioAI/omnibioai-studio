interface ProgressBarProps {
    value: number;
    max?: number;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'success' | 'danger' | 'warning' | 'accent' | 'info';
    showLabel?: boolean;
    label?: string;
}
export declare function ProgressBar({ value, max, size, variant, showLabel, label, }: ProgressBarProps): import("react").JSX.Element;
export {};
