import React from "react";
import { rowKeys, scalarText, validColumns, valueAt } from "../../../lib/pluginUiContracts";
import "./results.css";

// Trusted JSX composition only. Descriptors cannot provide children or cells.
// QueryRenderer supplies its detail button as a trailing cell, outside the
// scalar-column contract; the table never owns a request or row action.
export function ResultsTableRow({ columns, row, children }) {
  return <tr>{columns.map(column => <td key={column.key}>{scalarText(valueAt(row, column.key))}</td>)}{children}</tr>;
}

export default function ResultsTable({ columns, rows = [], rowKey, caption = "Results", loading = false,
  error = "", children, trailingHeading }) {
  const keys = rowKeys(rows, rowKey);
  if (!validColumns(columns) || keys === null) {
    return <p className="plugin-error" role="alert">Invalid table data.</p>;
  }
  return <div className="workbench-results" aria-busy={loading}>
    {loading && <p role="status">Loading results…</p>}
    {error && <p className="plugin-error" role="alert">{error}</p>}
    {!loading && !error && rows.length === 0 && <p role="status">No results.</p>}
    {!loading && !error && rows.length > 0 && <p role="status">{rows.length} {rows.length === 1 ? "result" : "results"} shown.</p>}
    {rows.length > 0 && <div className="omni-table-wrap workbench-table-scroll" role="region" aria-label={`${caption} table`} tabIndex={0}>
      <table className="omni-table workbench-results-table">
        <caption>{caption}</caption>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}
          {trailingHeading && <th scope="col">{trailingHeading}</th>}
        </tr></thead>
        <tbody>{children ?? rows.map((row, index) => <ResultsTableRow key={keys[index]} columns={columns} row={row} />)}</tbody>
      </table>
    </div>}
  </div>;
}
