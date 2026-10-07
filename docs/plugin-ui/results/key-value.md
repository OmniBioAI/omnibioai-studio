# KeyValueResult (`key_value`)

## Purpose

Ordered, labeled scalar identity/measurement/count/date/flag display — a
declared flat field list rendered as `<dl>`.

## When to use it

Any fixed, finite set of scalar facts about one record: identity fields,
measurements, dates, flags, long scientific descriptions.

## When NOT to use it

Nested records, arrays, generic JSON inspection, or links — compose
[DetailPanel](detail-panel.md) sections, or [ScientificReference](scientific-reference.md)
for links, instead of trying to encode structure into this component.

## Descriptor contract

`fields` comes from a validated `detail.fields` list (flat form) — this
component itself takes no independent descriptor shape; it is always
composed by [DetailPanel](detail-panel.md) (or directly by a result
renderer with its own `fields`/`record`).

```json
{"fields": [{"key": "pdb_id", "label": "PDB ID"}, {"key": "resolution_angstrom", "label": "Resolution (Å)"}], "record": {"pdb_id": "4HHB", "resolution_angstrom": 1.74}}
```

## Properties / fields

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `fields` | array of `{key, label}` | yes | Unique keys, safe identifier grammar |
| `record` | object | yes | Values: string, finite number, boolean, or `null`/missing only |
| `emptyMessage` | string | no | Default: "No detail available." |

## Backend responsibilities

Project exactly the declared fields and serialize any identifier that could
exceed JavaScript's safe-integer precision as a **string**, not a number.

## Frontend responsibilities

Render a semantic `<dl>` with one `<dt>`/`<dd>` pair per field that is
actually present and non-null in `record`; if none of the declared fields
have a present, non-null value, render the empty-state message instead of
an empty list.

## Security boundary

Escaped text only via `scalarText()` — no recursion, HTML, or formatter
function ever runs against `record` values.

## States

Populated, empty (`role="status"`, shows `emptyMessage`), error (invalid
`fields`/`record` shape renders a controlled alert).

## Accessibility

Semantic `<dl>`/`<dt>`/`<dd>` — screen readers announce label/value pairs
natively; the empty state is a `role="status"` message, not a visual blank.

## Scientific-data considerations

Long scientific descriptions and precise measurements (e.g. `1.74` Å
resolution) render verbatim, unrounded, unformatted.

## Example

RCSB PDB structure detail: `{"pdb_id": "4HHB", "resolution_angstrom": 1.74}`.

## Rendered behavior

A definition list, one row per present field, in the declared field order.

## Validation / failure behavior

Invalid `fields` (duplicate/malformed keys) or a `record` containing a
non-scalar value for a declared key renders `<p role="alert">Invalid scalar
result data.</p>` instead of a partial list.

## Testing

`tests/ui/workbench-detail-filter.test.jsx`, `tests/ui/workbench-results.test.jsx`.

## Related components

[detail-panel](detail-panel.md)
