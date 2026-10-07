import React from "react";
import { fieldText } from "./FieldShell";

/** Multiline presentation with no executable formatting or validation metadata. */
export default function TextAreaField({ input, value = "", onChange, controlId, describedBy, invalid = false, disabled = false, readOnly = false }) {
  return (
    <textarea
      id={controlId || `plugin-${input.id}`}
      name={`param_${input.id}`}
      rows={3}
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
