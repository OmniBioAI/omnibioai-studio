import React from "react";

/** Native boolean input. Django remains authoritative for normalization. */
export default function CheckboxField({ input, value = false, onChange, controlId, describedBy, invalid = false, disabled = false, readOnly = false }) {
  if (typeof value !== "boolean") return <p role="alert" className="plugin-field-error">Invalid boolean input value.</p>;
  return (
    <input
      id={controlId || `plugin-${input.id}`}
      name={`param_${input.id}`}
      type="checkbox"
      className="plugin-checkbox-control"
      required={Boolean(input.required)}
      checked={value}
      disabled={disabled || readOnly}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={event => onChange?.(event.target.checked)}
    />
  );
}
