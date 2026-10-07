import React from "react";
import "./filters.css";

export default function FilterControls({ title = "Filters", children, disabled = false, onReset }) {
  return <fieldset className="workbench-filters" disabled={disabled}>
    <legend>{title}</legend>
    <div className="workbench-filter-fields">{children}</div>
    <button type="button" className="omni-btn omni-btn--secondary omni-btn--md" onClick={onReset} disabled={disabled}>
      Reset filters
    </button>
  </fieldset>;
}
