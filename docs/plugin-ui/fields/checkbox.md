# CheckboxField (`checkbox`)

## Purpose

One genuine two-state boolean option — enabling an analysis step, including
a result class.

## When to use it

A real two-state scientific or execution switch with no third/indeterminate
state: "include intronic variants," "run quality control."

## When NOT to use it

- Tri-state or multi-value options — there is no indeterminate state.
- Schema v2 `query` descriptors — `checkbox` is **v1 only**;
  `validateBatchQueryDescriptor` doesn't include it in `validBatchField`'s
  allowed components.
- Consent/mutation actions, or string/numeric boolean encodings
  (`"true"`/`"false"` strings as a `text` field, `0`/`1` as `number`) — use
  the real boolean type.

## Descriptor contract

```json
{"id": "include_intronic", "widget": "checkbox", "format": "boolean", "label": "Include intronic variants", "description": "Include intronic consequences.", "required": false, "multiple": false, "default": false}
```

v1 only. `format` must be `"boolean"`, `multiple` must be `false`, and
`default` must be a real JSON boolean — `validateField` rejects anything
else (`field.format !== "boolean" || field.multiple !== false || typeof field.default !== "boolean"`).

## Properties / fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `format` | `"boolean"` | yes | |
| `multiple` | `false` | yes | Always exactly `false` |
| `default` | boolean | yes | An omitted value is normalized to `false` server-side |

## Backend responsibilities

Independently enforce type, requiredness, and scientific validity. "Required"
means the submitted value must be `true` — not merely that the form key was
present.

## Frontend responsibilities

Studio always submits an explicit `"true"` or `"false"` string to
`param_{id}` — **including unchecked controls** — so the backend can
distinguish "explicitly false" from "omitted."

## Security boundary

Boolean-only; no encoding ambiguity the backend has to guess at. The backend
must still independently validate and normalize — a boolean submitted from
the browser is not authorization for anything by itself.

## States

Checked, unchecked, disabled, invalid, required (meaning: must be checked).

## Accessibility

Native `<input type="checkbox">`; associated label/help/error via
`FieldShell`; native Space-key toggling; visible token-based focus ring.

## Scientific-data considerations

Not applicable — this component carries no scientific text content.

## Example

Toxicity-prediction and QC-step switches across single-cell and GWAS/popgen
analysis plugins (per the existing component-library audit).

## Rendered behavior

A native checkbox; `PluginField` disables it when `readOnly` is set (unlike
free-text fields, which stay visually editable but inert via `readOnly` —
`checkbox` is explicitly disabled in that case).

## Validation / failure behavior

A non-boolean runtime `value` prop renders `<p role="alert">Invalid boolean
input value.</p>` instead of the control.

## Testing

`tests/ui/workbench-choice-fields.test.jsx`.

## Related components

[multiselect](multiselect.md)
