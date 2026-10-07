import React from "react";
import { fieldText } from "./FieldShell";

/** Single-line presentation. Validation and normalization remain on Django. */
export default function TextField({ input, value = "", onChange, controlId, describedBy, invalid = false, disabled = false, readOnly = false }) {
  return (
    <input
      id={controlId || `plugin-${input.id}`}
      name={`param_${input.id}`}
      type="text"
      className="studio-field plugin-field-control"
      placeholder={fieldText(input.placeholder)}
      required={Boolean(input.required)}
      value={fieldText(value)}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={event => onChange?.(event.target.value)}
    />
  );
}
