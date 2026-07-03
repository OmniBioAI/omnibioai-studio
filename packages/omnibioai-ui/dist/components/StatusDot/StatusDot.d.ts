type Status = 'running' | 'success' | 'failed' | 'queued' | 'idle';
interface StatusDotProps {
    status: Status;
    label?: string;
}
export declare function StatusDot({ status, label }: StatusDotProps): import("react").JSX.Element;
export {};
