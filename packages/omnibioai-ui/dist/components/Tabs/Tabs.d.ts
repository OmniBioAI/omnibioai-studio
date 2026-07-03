import { default as React } from 'react';
export interface Tab {
    key: string;
    label: string;
    content: React.ReactNode;
}
interface TabsProps {
    tabs: Tab[];
    defaultTab?: string;
    onChange?: (key: string) => void;
}
export declare function Tabs({ tabs, defaultTab, onChange }: TabsProps): React.JSX.Element;
export {};
