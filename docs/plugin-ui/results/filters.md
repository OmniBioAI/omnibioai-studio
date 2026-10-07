# FilterControls (`filters`)

## Purpose

Group a subset of a query plugin's own existing, optional inputs as
secondary search criteria, with a reset action.

## When to use it

A `query` plugin with a few optional `text`/`select`/`number` inputs that
make sense presented separately from the primary search field — e.g.
organism/resolution filters alongside a structure search.

## When NOT to use it

Query builders, arbitrary operators/expressions, URLs, or paths — this
component groups existing fields; it introduces no new query vocabulary of
its own.

## Descriptor contract

```json
{"component": "filters", "title": "Filters", "field_ids": ["organism", "max_resolution"]}
```

`field_ids` must be unique, non-empty, and **cannot reference every input**
(at least one input — normally the primary search field — must stay outside
the filter group). Every referenced ID must name an existing input that is
`required: false` and whose `component` is one of `text`, `select`,
`number`.

## Properties / fields

| Key | Type | Notes |
| --- | --- | --- |
| `title` | non-empty string | |
| `field_ids` | unique array of existing optional-input IDs | No operators, no repeated field definitions, no query expressions |

## Backend responsibilities

Decide which fields are actually filterable, normalize and scientifically
validate their values, and construct the upstream query — the frontend
constructs no request of its own; `QueryRenderer` retains the single fixed
query adapter regardless of which fields are grouped as filters.

## Frontend responsibilities

`FilterControls.jsx` renders a native `<fieldset>`/`<legend>` wrapping the
referenced fields (rendered by `PluginForm` exactly like any other field)
plus a Reset button. Reset restores only the referenced fields to their
declared defaults — it does not submit the form.

## Security boundary

No request of any kind originates from this component; it is pure grouping
and reset UX around fields that are already validated by the same rules as
every other field.

## States

Enabled, disabled (passed down during submission), reset (returns grouped
fields to declared defaults and clears their validation errors).

## Accessibility

Native `<fieldset disabled>`/`<legend>` semantics; the Reset button has
visible focus and native disabled state.

## Scientific-data considerations

Not applicable beyond whatever the grouped fields themselves require.

## Example

RCSB PDB's organism/resolution filter group; similar optional-criteria
grouping exists in ClinVar, ArrayExpress, BioStudies, and Reactome as reuse
evidence.

## Rendered behavior

A bordered, legended group containing the referenced fields and a Reset
button beneath them.

## Validation / failure behavior

Unknown `field_ids`, a referenced required or non-text/select/number field,
or a `field_ids` list covering every input all fail descriptor validation
(`validFilterDescriptor`) before the component ever renders.

## Testing

`tests/ui/workbench-detail-filter.test.jsx`, `tests/ui/query-batch.test.jsx`.

## Related components

[table](table.md), [text](../fields/text.md), [select](../fields/select.md),
[number](../fields/number.md)
