import React from "react";
import "./fields.css";

/** Inert text only: descriptors and runtime values never become markup or props. */
export function fieldText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

export default function FieldShell({ controlId, fieldId, label, description, unit, required, error, children }) {
  return (
    <div className="plugin-field" data-field-id={fieldId}>
      <label htmlFor={controlId}>
        {fieldText(label)}{required && <span aria-hidden="true"> *</span>}
      </label>
      {description && <small id={`${controlId}-description`}>{fieldText(description)}</small>}
      {children}
      {unit && <small id={`${controlId}-unit`}>Unit: {fieldText(unit)}</small>}
      {error && <p id={`${controlId}-error`} className="plugin-field-error">{fieldText(error)}</p>}
    </div>
  );
}
