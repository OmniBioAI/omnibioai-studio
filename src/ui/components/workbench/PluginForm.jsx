import React from "react";
import PluginField from "./PluginField";
import { fieldText } from "./fields/FieldShell";

function currentValue(input, values) {
  const value = values[input.id];
  if (value !== undefined) return value;
  const component = input.component ?? input.widget;
  if (input.default !== undefined) return input.default;
  if (component === "checkbox") return false;
  if (component === "multiselect") return [];
  return "";
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
      if (condition.operator !== "equals" && condition.operator !== "in") throw new Error("Unsupported conditional operator.");
      const values = condition.operator === "equals" ? [condition.value] : condition.value;
      if (!Array.isArray(values) || values.length === 0 || new Set(values).size !== values.length ||
          values.some(value => typeof value !== "string" || !controller.choices?.includes(value))) throw new Error("Invalid conditional choice.");
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
    const controllerValue = currentValue(fields.get(condition.controller) || { id: condition.controller, default: "" }, values);
    const active = condition.operator === "in"
      ? condition.value.includes(controllerValue)
      : controllerValue === condition.value;
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
  fieldErrors = {},
  disabled = false,
  readOnly = false,
  submitting = false,
  submitLabel = "Run analysis",
  filters,
  FilterComponent,
}) {
  const [validationErrors, setValidationErrors] = React.useState({});
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
    if (disabled || readOnly || submitting) {
      event.preventDefault();
      return;
    }
    const errors = {};
    let firstInvalid;
    const fields = new Map(inputs.map(input => [input.id, input]));
    const controls = Array.from(event.currentTarget.elements);
    for (const input of inputs) {
      const state = fieldState(input, values, fields);
      if (!state.visible) continue;
      const control = controls.find(element => element.closest(".plugin-field")?.dataset.fieldId === input.id);
      const component = input.component ?? input.widget;
      const present = component === "file"
        ? (files[input.id] || []).length > 0
        : component === "checkbox"
          ? currentValue(input, values) === true
          : component === "multiselect"
            ? Array.isArray(currentValue(input, values)) && currentValue(input, values).length > 0
            : fieldText(currentValue(input, values)).trim().length > 0;
      if (control?.validity.badInput) {
        errors[input.id] = `${input.label} must be a number.`;
      } else if (state.required && !present) {
        errors[input.id] = `${input.label} is required.`;
      } else if ((input.component ?? input.widget) === "number" && control && !control.validity.valid) {
        errors[input.id] = `${input.label}: ${control.validationMessage}`;
      }
      if (errors[input.id] && !firstInvalid) firstInvalid = control;
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      firstInvalid?.focus();
      return;
    }
    onSubmit?.(event);
  }

  function clearValidationError(id, nextValues = values) {
    setValidationErrors(previous => {
      if (Object.keys(previous).length === 0) return previous;
      const next = { ...previous };
      delete next[id];
      const fields = new Map(inputs.map(input => [input.id, input]));
      inputs.forEach(input => {
        if (!fieldState(input, nextValues, fields).visible) delete next[input.id];
      });
      return next;
    });
  }

  const displayError = Object.values(validationErrors)[0] || fieldText(error);
  const fields = new Map(inputs.map(input => [input.id, input]));
  const filterIds = new Set(FilterComponent ? (filters?.field_ids || []) : []);
  const renderField = input => {
    const state = fieldState(input, values, fields);
    if (!state.visible) return null;
    return <PluginField
      key={input.id}
      input={input}
      required={state.required}
      value={currentValue(input, values)}
      files={files[input.id] || []}
      error={validationErrors[input.id] || fieldErrors[input.id]}
      disabled={disabled || submitting}
      readOnly={readOnly}
      onValueChange={value => { clearValidationError(input.id, { ...values, [input.id]: value }); onValueChange?.(input.id, value); }}
      onFilesChange={fileList => { clearValidationError(input.id); onFilesChange?.(input.id, fileList); }}
    />;
  };
  function resetFilters() {
    inputs.filter(input => filterIds.has(input.id)).forEach(input => {
      const next = input.default ?? "";
      onValueChange?.(input.id, next);
    });
    setValidationErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !filterIds.has(id))));
  }
  return (
    <form className="plugin-form" onSubmit={handleSubmit} encType="multipart/form-data" aria-busy={submitting} noValidate>
      {inputs.filter(input => !filterIds.has(input.id)).map(renderField)}
      {FilterComponent && filters && <FilterComponent title={filters.title} disabled={disabled || readOnly || submitting} onReset={resetFilters}>
        {inputs.filter(input => filterIds.has(input.id)).map(renderField)}
      </FilterComponent>}
      {displayError && <p role="alert" className="plugin-error">{displayError}</p>}
      <button type="submit" className="omni-btn omni-btn--primary omni-btn--md" disabled={disabled || readOnly || submitting}>
        {submitting ? "Loading…" : submitLabel}
      </button>
    </form>
  );
}
