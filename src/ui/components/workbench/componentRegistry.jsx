import TextField from "./fields/TextField";
import TextAreaField from "./fields/TextAreaField";
import NumberField from "./fields/NumberField";
import ResultsTable from "./results/ResultsTable";
import PaginationControls from "./results/PaginationControls";
import KeyValueResult from "./results/KeyValueResult";
import DetailPanel from "./results/DetailPanel";
import FilterControls from "./filters/FilterControls";

export { TextField, TextAreaField, NumberField, ResultsTable, PaginationControls, KeyValueResult, DetailPanel, FilterControls };
export const TextareaField = TextAreaField;

/**
 * The descriptor is data. Keep this registry explicit so descriptor values
 * can only select known presentation behavior.
 */
export function FileUploadField({ input, files = [], onChange, controlId, describedBy, invalid, disabled, readOnly }) {
  return (
    <input
      id={controlId || `plugin-${input.id}`}
      name={`input_${input.id}`}
      type="file"
      className="studio-field"
      multiple={Boolean(input.multiple)}
      accept={input.accept || undefined}
      required={Boolean(input.required)}
      disabled={disabled || readOnly}
      aria-invalid={invalid || undefined}
      onChange={event => onChange?.(event.target.files)}
      aria-describedby={describedBy}
      data-selected-count={files.length}
    />
  );
}

export function SelectField({ input, value = "", onChange, controlId, describedBy, invalid, disabled, readOnly }) {
  return (
    <select
      id={controlId || `plugin-${input.id}`}
      name={`query_${input.id}`}
      className="studio-field workbench-field-control"
      value={value}
      onChange={event => onChange?.(event.target.value)}
      required={Boolean(input.required)}
      disabled={disabled || readOnly}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >{(input.choices || []).map(choice => <option key={choice} value={choice}>{choice || "Any"}</option>)}</select>
  );
}

export const WORKBENCH_COMPONENT_REGISTRY = Object.freeze({
  file: FileUploadField,
  text: TextField,
  textarea: TextareaField,
  select: SelectField,
  number: NumberField,
  table: ResultsTable,
  pagination: PaginationControls,
  key_value: KeyValueResult,
  detail: DetailPanel,
  filters: FilterControls,
});

export const WORKBENCH_FIELD_TYPES = Object.freeze(["file", "text", "textarea", "select", "number"]);

export function resolveWorkbenchComponent(type) {
  if (typeof type !== "string") return null;
  return Object.prototype.hasOwnProperty.call(WORKBENCH_COMPONENT_REGISTRY, type)
    ? WORKBENCH_COMPONENT_REGISTRY[type]
    : null;
}
