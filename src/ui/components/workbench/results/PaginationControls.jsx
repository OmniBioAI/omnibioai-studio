import React from "react";
import { validPagination } from "../../../lib/pluginUiContracts";
import "./results.css";

// onNavigate is a local UI event, never descriptor metadata. The renderer
// translates previous/next into its fixed backend operation.
export default function PaginationControls({ pagination, onNavigate, loading = false, disabled = false }) {
  if (!validPagination(pagination)) return <p role="alert" className="plugin-error">Invalid pagination data.</p>;
  const { page, total_items: total } = pagination;
  return <nav className="workbench-pagination" aria-label="Results pagination" aria-busy={loading}>
    <button type="button" className="omni-btn omni-btn--secondary omni-btn--md"
      disabled={disabled || loading || !pagination.has_previous} onClick={() => onNavigate?.("previous")}>Previous</button>
    <span className="workbench-page-summary" role="status" aria-live="polite">
      <span aria-current="page">Page {page}</span><span> · {total} {total === 1 ? "result" : "results"}</span>
      {loading && <span> · Loading…</span>}
    </span>
    <button type="button" className="omni-btn omni-btn--secondary omni-btn--md"
      disabled={disabled || loading || !pagination.has_next} onClick={() => onNavigate?.("next")}>Next</button>
  </nav>;
}
