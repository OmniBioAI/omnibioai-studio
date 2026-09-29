import React from "react";
import { resolveWorkbenchComponent } from "./componentRegistry";

export function descriptorComponent(input) {
  return input?.component ?? input?.widget ?? "";
}

export default function PluginField({ input, value, files, required = input.required, onValueChange, onFilesChange }) {
  const type = descriptorComponent(input);
  const Component = resolveWorkbenchComponent(type);

  if (!Component) {
    return <p role="alert" className="plugin-error">Unsupported plugin input component.</p>;
  }

  const renderedInput = { ...input, required: Boolean(required) };
  return (
    <div className="plugin-field">
      <label htmlFor={`plugin-${input.id}`}>
        {input.label}{required ? " *" : ""}
      </label>
      <small id={`plugin-${input.id}-description`}>
        {input.description} ({input.format})
      </small>
      <Component
        input={renderedInput}
        value={value}
        files={files}
        onChange={type === "file" ? onFilesChange : onValueChange}
      />
    </div>
  );
}
