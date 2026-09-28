import React from "react";
import { resolveWorkbenchComponent } from "./componentRegistry";

export function descriptorComponent(input) {
  return input?.component ?? input?.widget ?? "";
}

export default function PluginField({ input, value, files, onValueChange, onFilesChange }) {
  const type = descriptorComponent(input);
  const Component = resolveWorkbenchComponent(type);

  if (!Component) {
    return <p role="alert" className="plugin-error">Unsupported plugin input component.</p>;
  }

  return (
    <div className="plugin-field">
      <label htmlFor={`plugin-${input.id}`}>
        {input.label}{input.required ? " *" : ""}
      </label>
      <small id={`plugin-${input.id}-description`}>
        {input.description} ({input.format})
      </small>
      <Component
        input={input}
        value={value}
        files={files}
        onChange={type === "file" ? onFilesChange : onValueChange}
      />
    </div>
  );
}
