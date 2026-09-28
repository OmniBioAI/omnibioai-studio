import { Textarea } from "../UI";

/**
 * The descriptor is data. Keep this registry explicit so descriptor values
 * can only select known presentation behavior.
 */
export function FileUploadField({ input, files = [], onChange }) {
  return (
    <input
      id={`plugin-${input.id}`}
      name={`input_${input.id}`}
      type="file"
      className="studio-field"
      multiple={Boolean(input.multiple)}
      accept={input.accept || undefined}
      required={Boolean(input.required)}
      onChange={event => onChange?.(event.target.files)}
      aria-describedby={`plugin-${input.id}-description`}
      data-selected-count={files.length}
    />
  );
}

export function TextField({ input, value = "", onChange }) {
  return (
    <Textarea
      id={`plugin-${input.id}`}
      name={`param_${input.id}`}
      rows={3}
      placeholder={input.placeholder || ""}
      value={value}
      onChange={event => onChange?.(event.target.value)}
      aria-describedby={`plugin-${input.id}-description`}
    />
  );
}

// textarea is an explicit alias so the allowlist can distinguish descriptor
// vocabulary without creating another design-system textarea implementation.
export const TextareaField = TextField;

export const WORKBENCH_COMPONENT_REGISTRY = Object.freeze({
  file: FileUploadField,
  text: TextField,
  textarea: TextareaField,
});

export function resolveWorkbenchComponent(type) {
  if (typeof type !== "string") return null;
  return WORKBENCH_COMPONENT_REGISTRY[type] || null;
}
