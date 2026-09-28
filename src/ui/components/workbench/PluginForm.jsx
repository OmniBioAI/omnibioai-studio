import React from "react";
import PluginField from "./PluginField";

export default function PluginForm({
  inputs = [],
  values = {},
  files = {},
  onValueChange,
  onFilesChange,
  onSubmit,
  error,
  submitting = false,
  submitLabel = "Run analysis",
}) {
  return (
    <form onSubmit={onSubmit} encType="multipart/form-data">
      {inputs.map(input => (
        <PluginField
          key={input.id}
          input={input}
          value={values[input.id] || ""}
          files={files[input.id] || []}
          onValueChange={value => onValueChange?.(input.id, value)}
          onFilesChange={fileList => onFilesChange?.(input.id, fileList)}
        />
      ))}
      {error && <p role="alert" className="plugin-error">{error}</p>}
      <button type="submit" className="omni-btn omni-btn--primary" disabled={submitting}>
        {submitting ? "Loading…" : submitLabel}
      </button>
    </form>
  );
}
