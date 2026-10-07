# SelectField (`select`)

## Purpose

A single choice from a fixed, finite, descriptor-owned set of string values.

## When to use it

Any input with a small, fixed vocabulary known at descriptor-authoring time
— mode switches, fixed categories, enum-like parameters. Also the only
field type that can act as a **conditional controller** (see below).

## When NOT to use it

- A value set with labels distinct from their submitted values, or more
  than a handful of choices with real display labels — consider
  [multiselect](multiselect.md)'s richer `{value,label}` shape if the
  interaction is genuinely multi-choice (v1 only).
- Choices that come from the server/caller's own data rather than the
  descriptor — use [resource-select](resource-select.md) (v1 only); there is
  no remote-option-loading mode for `select` itself.

## Descriptor contract

```json
{"id": "mode", "component": "select", "format": "text", "label": "Mode", "description": "Execution mode.", "required": true, "choices": ["infer", "train"], "default": "infer"}
```

Valid in both schema v1 and v2. `choices` is a flat array of strings. V1's
`validateField` checks only that every choice is a string; v2's
`validBatchField` additionally requires a non-empty, duplicate-free array.
`default`, if present, must be one of `choices`.

## Properties / fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `choices` | array of strings | yes | V2 requires non-empty and duplicate-free; rendered as `<option>` text directly — no separate label |
| `default` | string | no | Must be a member of `choices` |

Note: unlike `multiselect`'s `{value,label}` pairs, plain `select` choices
are used as both the submitted value and the displayed text.

## Backend responsibilities

Treat the submitted value as untrusted even though it came from a
descriptor-declared set — re-validate it is one of the plugin's actual
accepted values server-side.

## Frontend responsibilities

Render a native `<select>` populated from `input.choices`; an empty-string
choice renders as the literal text `"Any"` as a convenience for optional
filter-style selects.

## Security boundary

No remote option endpoint exists for this component — all choices are
embedded directly in the already-validated descriptor; there is no way for
a `select` field to fetch options from a URL at render time.

## States

Default, disabled, read-only, invalid, required.

## Accessibility

Native `<select>` with full keyboard operation (arrow keys, type-ahead) and
`FieldShell` label association.

## Scientific-data considerations

Choice text wraps rather than truncating in the native dropdown rendering;
no limit on label length is enforced beyond normal `<option>` behavior.

## Conditional controller role

A `select` field — and only a `select` field — can be named as the
`controller` of another field's `conditions`. See
[descriptor-spec.md](../descriptor-spec.md) for the full grammar
(`controller`/`operator: "equals"`/`value`/`effect: "visible"|"required"`).
A field cannot be its own controller, condition chains are rejected (a
controller field cannot itself have `conditions`), and `value` must be one
of the controller's own `choices`.

## Example

Classifier-style plugins use a `mode` select (`"infer"` vs `"train"`) as a
conditional controller for fields that are only required in one mode — see
[examples/conditional-classifier.md](../examples/conditional-classifier.md)
for the current, honest state of real-plugin evidence for this pattern.

## Rendered behavior

A native dropdown; the first/only selected value is whichever matches the
controlled `value` prop.

## Validation / failure behavior

Non-array `choices`, non-string entries, or a `default` not present in
`choices` fail descriptor validation before the field ever renders.

## Testing

`tests/ui/workbench-fields.test.jsx`, `tests/ui/workbench-components.test.jsx`
(conditional-field cases).

## Related components

[multiselect](multiselect.md), [resource-select](resource-select.md)
