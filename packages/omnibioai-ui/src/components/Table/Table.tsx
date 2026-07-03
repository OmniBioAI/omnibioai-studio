import React, { useState, useMemo } from 'react';
import './Table.css';

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

type SortDir = 'asc' | 'desc' | null;

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 10,
  emptyMessage = 'No results',
}: TableProps<T>) {
  const [sortKey, setSortKey]   = useState<keyof T | null>(null);
  const [sortDir, setSortDir]   = useState<SortDir>(null);
  const [page, setPage]         = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const pages     = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage  = Math.min(page, pages);
  const slice     = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
    setPage(1);
  }

  return (
    <div className="omni-table-wrap">
      <table className="omni-table">
        <thead>
          <tr>
            {columns.map(col => {
              const isSorted = sortKey === col.key;
              const cls = [
                col.sortable ? 'sortable' : '',
                col.align === 'right' ? 'r' : '',
                isSorted && sortDir === 'asc'  ? 'sorted-asc'  : '',
                isSorted && sortDir === 'desc' ? 'sorted-desc' : '',
              ].filter(Boolean).join(' ');
              return (
                <th key={String(col.key)} className={cls}
                    onClick={() => handleSort(col)}>
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {slice.length === 0 ? (
            <tr><td colSpan={columns.length}
              style={{ textAlign:'center', color:'var(--color-text-muted)',
                       padding:'24px' }}>
              {emptyMessage}
            </td></tr>
          ) : slice.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={String(col.key)}
                    className={col.align === 'right' ? 'r' : ''}>
                  {col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="omni-table-footer">
          <button className="omni-pg-btn"
            disabled={safePage === 1}
            onClick={() => setPage(p => p - 1)}>←</button>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === pages ||
                         Math.abs(p - safePage) <= 1)
            .reduce<(number | '...')[]>((acc, p, i, arr) => {
              if (i > 0 && (p as number) - (arr[i-1] as number) > 1)
                acc.push('...');
              acc.push(p); return acc;
            }, [])
            .map((p, i) => p === '...'
              ? <span key={`e${i}`} className="omni-pg-info">…</span>
              : <button key={p} className={`omni-pg-btn${safePage === p ? ' active' : ''}`}
                  onClick={() => setPage(p as number)}>{p}</button>
            )}
          <button className="omni-pg-btn"
            disabled={safePage === pages}
            onClick={() => setPage(p => p + 1)}>→</button>
          <span className="omni-pg-info"
            style={{ marginLeft:'auto' }}>
            {sorted.length} items
          </span>
        </div>
      )}
    </div>
  );
}
