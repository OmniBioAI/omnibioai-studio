import { default as React } from 'react';
interface CardProps {
    children: React.ReactNode;
    title?: string;
    actions?: React.ReactNode;
    padding?: string;
    elevated?: boolean;
    onClick?: () => void;
    className?: string;
}
export declare function Card({ children, title, actions, padding, elevated, onClick, className }: CardProps): React.JSX.Element;
export {};
