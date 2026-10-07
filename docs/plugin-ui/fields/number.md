# NumberField (`number`)

## Purpose

Numeric input — integer or floating-point — with optional bounds, step, and
a display unit.

## When to use it

Any bounded or unbounded numeric parameter in a **schema v2 `query`**
descriptor: resolution cutoffs, page sizes, numeric filters.

## When NOT to use it

- **Schema v1 descriptors (`async_analysis`/`informational`, or v1 `query`)
  cannot use `number` at all today.** The v1 field validator
  (`validateField` in `src/ui/lib/pluginApi.js`) only recognizes `file`,
  `text`, `textarea`, `select`, `checkbox`, `multiselect`, `resource_select`
  — a `number` component on a v1 descriptor fails validation outright. If
  your plugin needs numeric input and isn't a v2 `query` plugin, use `text`
  and validate/parse the numeric string entirely server-side.
- Finite discrete choices that happen to be numbers — use [select](select.md)
  with string values instead, if the set is small and fixed.

## Descriptor contract

```json
{"id": "max_resolution", "component": "number", "format": "float", "label": "Maximum resolution", "description": "Positive limit, validated by Django.", "required": false, "max": 1000, "step": "any", "unit": "Å"}
```

## Properties / fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `format` | `"integer"` or `"float"` | yes | |
| `min`, `max` | finite number | no | Integer fields require safe integers; `min` must not exceed `max` |
| `step` | positive finite number, or `"any"` | no | `"any"` is only valid when `format` is `"float"`; omitted defaults to `1` (integer) or `"any"` (float) |
| `default` | finite number within `[min, max]` | no | |
| `unit` | string, 1–32 chars | no | Inert display text, e.g. `"Å"`, never converted or rounded |

`validBatchField` (`src/ui/lib/pluginUiContracts.js`) enforces: integer
values are safe integers; `min <= max`; `default` within bounds if present;
`step` positive and finite (or `"any"` for float only).

## Backend responsibilities

Final numeric parsing, scientific-range validation, and normalization.
Browser numeric validity (the native `<input type="number">`'s own
constraint validation) is UX feedback only — it is never treated as backend
validation or authorization. RCSB's real `max_resolution` field, for
example, accepts resolutions smaller than `0.1`, so the backend must not
impose a stricter `min`/`step` than the descriptor actually declares.

## Frontend responsibilities

Render a native `<input type="number">` with the declared `min`/`max`/`step`;
keep the edited value as a string until change; never round or
scientifically convert it. If the descriptor's own numeric metadata is
invalid (e.g. `min > max`), the field renders a controlled error instead of
a broken input.

## Security boundary

Numeric metadata is validated at the same chokepoint as every other
descriptor value; no formatter, callback, or unit-conversion code is ever
invoked from descriptor data.

## States

Default, disabled, read-only, invalid (both descriptor-metadata-invalid and
value-invalid render distinctly), required.

## Accessibility

`FieldShell` label/description/error, plus a unit line (`unit` renders as
`Unit: {value}` alongside the control) associated via `aria-describedby`.

## Scientific-data considerations

Units are inert display text — `"Å"`, `"°C"`, etc. — never used
for conversion. Scientific notation entered by the user is passed through
as-is to the backend for authoritative parsing.

## Example

RCSB PDB's `max_resolution` (float, `max: 1000`, `step: "any"`, `unit: "Å"`);
page size fields use integer bounds `1`–`100`.

## Rendered behavior

A native numeric spinner input with unit text alongside it.

## Validation / failure behavior

Invalid descriptor metadata (e.g. `min > max`, non-finite bound) renders
`<p role="alert">Invalid numeric input metadata.</p>` instead of an input —
this is a fail-closed component-level check in `NumberField.jsx`, independent
of the earlier descriptor-validation pass.

## Testing

`tests/ui/workbench-fields.test.jsx`, `tests/ui/query-batch.test.jsx`.

## Related components

[select](select.md), [filters](../results/filters.md)
