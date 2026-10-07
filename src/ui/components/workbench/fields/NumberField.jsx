import React from "react";
import { fieldText } from "./FieldShell";

/** Keep the browser's textual value; do not round or scientifically validate it. */
export default function NumberField({ input, value = "", onChange, controlId, describedBy, invalid = false, disabled = false, readOnly = false }) {
  const integer = input.format === "integer";
  const step = input.step ?? (integer ? 1 : "any");
  const validNumber = number => typeof number === "number" && Number.isFinite(number) && (!integer || Number.isSafeInteger(number));
  const valid = (integer || input.format === "float") &&
    (input.min === undefined || validNumber(input.min)) &&
    (input.max === undefined || validNumber(input.max)) &&
    (input.min === undefined || input.max === undefined || input.min <= input.max) &&
    ((step === "any" && !integer) || (validNumber(step) && step > 0));

  if (!valid) return <p role="alert" className="plugin-error">Invalid numeric input metadata.</p>;

  return (
    <input
      id={controlId || `plugin-${input.id}`}
      name={`param_${input.id}`}
      type="number"
      className="studio-field plugin-field-control"
      placeholder={fieldText(input.placeholder)}
      required={Boolean(input.required)}
      min={input.min}
      max={input.max}
      step={step}
      value={fieldText(value)}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={event => onChange?.(event.target.value)}
    />
  );
}
