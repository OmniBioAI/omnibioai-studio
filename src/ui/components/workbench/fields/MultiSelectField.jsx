import React from "react";
import { validFiniteChoices } from "../../../lib/pluginUiContracts";

/** Multiple selection from a finite descriptor-owned choice set. */
export default function MultiSelectField({ input, value = [], onChange, controlId, describedBy, invalid = false, disabled = false, readOnly = false }) {
  const choices = input?.choices;
  const allowed = validFiniteChoices(choices) ? new Set(choices.map(choice => choice.value)) : null;
  const validValue = Array.isArray(value) && new Set(value).size === value.length &&
    value.every(item => typeof item === "string" && allowed?.has(item));
  if (!allowed || !validValue) return <p role="alert" className="plugin-field-error">Invalid finite multiselect metadata.</p>;
  return (
    <select
      id={controlId || `plugin-${input.id}`}
      name={`param_${input.id}`}
      className="studio-field plugin-field-control plugin-multiselect-control"
      multiple
      size={Math.min(Math.max(choices.length, 3), 8)}
      required={Boolean(input.required)}
      value={value}
      disabled={disabled || readOnly}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={event => {
        const selected = new Set(Array.from(event.target.selectedOptions, option => option.value));
        onChange?.(choices.filter(choice => selected.has(choice.value)).map(choice => choice.value));
      }}
    >
      {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </select>
  );
}
