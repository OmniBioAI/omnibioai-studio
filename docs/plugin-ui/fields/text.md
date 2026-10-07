# TextField (`text`)

## Purpose

Single-line plain-text input: names, accessions, species, free-text search
terms.

## When to use it

Any single scalar text value where there is no finite choice set and no
numeric semantics — sample IDs, gene symbols, organism names, free-text
queries.

## When NOT to use it

- A finite set of choices — use [select](select.md).
- Multiline text (hyperparameter JSON, notes) — use
  [textarea](textarea.md).
- Numeric values — use [number](number.md) (v2 `query` only).
- Picking one of the caller's own resources — use
  [resource-select](resource-select.md).

## Descriptor contract

```json
{"id": "sample_id", "component": "text", "format": "text", "label": "Sample ID", "description": "Identifier of the sample to analyze.", "required": true}
```

Valid in both schema v1 and v2.

## Properties / fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | `^[a-z][a-z0-9_]*$`, not a forbidden name |
| `component` | `"text"` | yes | |
| `format` | `"text"` | yes | |
| `label`, `description` | string | yes | Rendered as inert, escaped text |
| `required` | boolean | yes | |
| `default` | string | no | Applied only when the value is `undefined` |
| `placeholder` | string | no | |

No `min`/`max`/`pattern`/length bound exists on this component today — length
and content validation are entirely the backend's responsibility.

## Backend responsibilities

Validate length, character set, and scientific meaning (e.g. accession
format) server-side; normalize before use. The browser performs no scientific
validation.

## Frontend responsibilities

Render a native `<input type="text">`, hold the controlled value, submit it
as `param_{id}` (async_analysis) or as the matching query parameter (query).

## Security boundary

Plain text only — no HTML execution path exists. Display strings may
contain HTML-looking characters but are always rendered as escaped text,
never as markup.

## States

Default, disabled, read-only, invalid (native `aria-invalid` + inline error
from `FieldShell`), required.

## Accessibility

Native `<label for>` association via `FieldShell`, native keyboard behavior,
`aria-describedby` pointing at description/unit/error as applicable.

## Scientific-data considerations

Long gene/variant identifiers and accessions are not truncated or
reformatted; the input simply grows with content per normal text-input
behavior. Display strings wrap in surrounding read-only contexts (see result
components) rather than being ellipsized.

## Example

RCSB PDB's `pdb_id` and `organism` query inputs (see
[examples/query-rcsb-pdb.md](../examples/query-rcsb-pdb.md)) are both `text`.

## Rendered behavior

A standard text box with label, optional description/placeholder, and
required marker.

## Validation / failure behavior

Descriptor-level: `validateField`/`validBatchField` reject a missing/invalid
`id`, non-string `label`/`description`, or non-boolean `required`.
Runtime: no client-side content validation beyond native browser text-input
behavior; required-but-empty blocks submission with a focused inline error.

## Testing

`tests/ui/workbench-fields.test.jsx`, `tests/ui/workbench-components.test.jsx`.

## Related components

[textarea](textarea.md), [select](select.md), [number](number.md)
