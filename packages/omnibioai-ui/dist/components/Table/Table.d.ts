import { default as React } from 'react';
export interface Column<T> {
    key: keyof T;
    label: string;
    sortable?: boolean;
    align?: 'left' | 'right';
    render?: (value: T[keyof T], row: T) => React.ReactNode;
}
interface TableProps<T extends Record<string, unknown>> {
    columns: Column<T>[];
    data: T[];
    pageSize?: number;
    emptyMessage?: string;
}
export declare function Table<T extends Record<string, unknown>>({ columns, data, pageSize, emptyMessage, }: TableProps<T>): React.JSX.Element;
export {};
