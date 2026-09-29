import React from "react";
import PluginField from "./PluginField";

function currentValue(input, values) {
  const value = values[input.id];
  return value === undefined || value === "" ? (input.default ?? "") : value;
}

export function validateConditionalInputs(inputs) {
  if (!Array.isArray(inputs)) throw new Error("Invalid plugin input schema.");
  const fields = new Map();
  inputs.forEach(input => {
    if (!input || typeof input.id !== "string" || fields.has(input.id)) throw new Error("Invalid plugin input schema.");
    fields.set(input.id, input);
  });
  inputs.forEach(input => {
    if (input.conditions === undefined) return;
    if (!Array.isArray(input.conditions) || input.conditions.length === 0) throw new Error("Invalid conditional input schema.");
    const effects = new Set();
    input.conditions.forEach(condition => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition) ||
          Object.keys(condition).sort().join(",") !== "controller,effect,operator,value") {
        throw new Error("Invalid conditional input schema.");
      }
      const controller = fields.get(condition.controller);
      if (!controller || condition.controller === input.id) throw new Error("Invalid conditional controller.");
      if ((controller.component ?? controller.widget) !== "select") throw new Error("Invalid conditional controller.");
      if (condition.operator !== "equals") throw new Error("Unsupported conditional operator.");
      if (typeof condition.value !== "string" || !controller.choices?.includes(condition.value)) throw new Error("Invalid conditional choice.");
      if (condition.effect !== "visible" && condition.effect !== "required") throw new Error("Unsupported conditional effect.");
      if (effects.has(condition.effect) || controller.conditions !== undefined) throw new Error("Invalid conditional dependency.");
      effects.add(condition.effect);
    });
  });
  return true;
}

function fieldState(input, values, fields) {
  let visible = true;
  let required = Boolean(input.required);
  const conditions = input.conditions || [];
  conditions.forEach(condition => {
    const active = currentValue(fields.get(condition.controller) || { id: condition.controller, default: "" }, values) === condition.value;
    if (condition.effect === "visible") visible = active;
    if (condition.effect === "required") required = active;
  });
  return { visible, required };
}

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
  const [validationError, setValidationError] = React.useState("");
  let conditionallyValid = true;
  try {
    validateConditionalInputs(inputs);
  } catch (error) {
    conditionallyValid = false;
  }

  if (!conditionallyValid) {
    return <p role="alert" className="plugin-error">Invalid conditional input metadata.</p>;
  }

  function handleSubmit(event) {
    setValidationError("");
    const fields = new Map(inputs.map(input => [input.id, input]));
    for (const input of inputs) {
      const state = fieldState(input, values, fields);
      if (!state.visible || !state.required) continue;
      const present = (input.component ?? input.widget) === "file"
        ? (files[input.id] || []).length > 0
        : String(currentValue(input, values)).trim().length > 0;
      if (!present) {
        event.preventDefault();
        setValidationError(`${input.label} is required.`);
        return;
      }
    }
    onSubmit?.(event);
  }

  const displayError = validationError || error;
  const fields = new Map(inputs.map(input => [input.id, input]));
  return (
    <form onSubmit={handleSubmit} encType="multipart/form-data" noValidate>
      {inputs.map(input => {
        const state = fieldState(input, values, fields);
        if (!state.visible) return null;
        return <PluginField
          key={input.id}
          input={input}
          required={state.required}
          value={currentValue(input, values)}
          files={files[input.id] || []}
          onValueChange={value => onValueChange?.(input.id, value)}
          onFilesChange={fileList => onFilesChange?.(input.id, fileList)}
        />;
      })}
      {displayError && <p role="alert" className="plugin-error">{displayError}</p>}
      <button type="submit" className="omni-btn omni-btn--primary" disabled={submitting}>
        {submitting ? "Loading…" : submitLabel}
      </button>
    </form>
  );
}
