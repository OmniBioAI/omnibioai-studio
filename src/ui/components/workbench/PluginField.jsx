import React from "react";
import { resolveWorkbenchComponent, WORKBENCH_FIELD_TYPES } from "./componentRegistry";
import FieldShell, { fieldText } from "./fields/FieldShell";

export function descriptorComponent(input) {
  return input?.component ?? input?.widget ?? "";
}

export default function PluginField({ input, value, files, required = input?.required, error, disabled = false, readOnly = false, onValueChange, onFilesChange }) {
  const instanceId = React.useId();
  const type = descriptorComponent(input);
  const Component = resolveWorkbenchComponent(type);

  if (!WORKBENCH_FIELD_TYPES.includes(type) || !Component) {
    return <p role="alert" className="plugin-error">Unsupported plugin input component.</p>;
  }

  const controlId = `plugin-${input.id}-${instanceId}`;
  const description = [fieldText(input.description), input.format ? `(${fieldText(input.format)})` : ""].filter(Boolean).join(" ");
  const unit = type === "number" ? fieldText(input.unit) : "";
  const fieldError = fieldText(error);
  const describedBy = [
    description && `${controlId}-description`,
    unit && `${controlId}-unit`,
    fieldError && `${controlId}-error`,
  ].filter(Boolean).join(" ") || undefined;
  const renderedInput = { ...input, required: Boolean(required) };
  return (
    <FieldShell controlId={controlId} fieldId={input.id} label={input.label}
      description={description} unit={unit} required={required} error={fieldError}>
      <Component
        input={renderedInput}
        value={value}
        files={files}
        controlId={controlId}
        describedBy={describedBy}
        invalid={Boolean(fieldError)}
        disabled={disabled || (readOnly && (type === "file" || type === "select"))}
        readOnly={readOnly}
        onChange={type === "file" ? onFilesChange : onValueChange}
      />
    </FieldShell>
  );
}
