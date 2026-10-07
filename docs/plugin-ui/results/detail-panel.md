# DetailPanel (`detail`)

## Purpose

Show loading/error/empty/success states for one authorized selected-record
detail lookup, in either a flat form or one ordered level of sections.

## When to use it

A `query` plugin whose detail lookup returns either a flat set of scalar
fields, or a small number of named sections each of exactly one kind:
scalar, a bounded child table, provenance, or scientific references.

## When NOT to use it

Recursive JSON, arbitrary nesting, trees, mutations, dashboards, or
frontend scientific interpretation. Sections never nest — there is no
second level.

## Descriptor contract

**Flat form:**

```json
{"component": "detail", "title": "Structure detail", "fields": [{"key": "pdb_id", "label": "PDB ID"}, {"key": "resolution_angstrom", "label": "Resolution (Å)"}]}
```

**Sectioned form** (one ordered level only):

```json
{
  "component": "detail", "title": "Structure detail",
  "sections": [
    {"id": "identity", "title": "Structure identity", "presentation": "scalar", "fields": [{"key": "pdb_id", "label": "PDB ID"}]},
    {"id": "citation_authors", "title": "Primary citation authors", "presentation": "table", "optional": true, "row_key": "position", "max_rows": 100, "columns": [{"key": "position", "label": "Order"}, {"key": "author", "label": "Author"}]},
    {"id": "primary_references", "title": "Primary citation references", "presentation": "references", "optional": true, "reference_types": ["doi", "pubmed"], "max_items": 2},
    {"id": "provenance", "title": "Provenance", "presentation": "provenance", "fields": [{"key": "source", "label": "Source database"}]}
  ]
}
```

A descriptor declares exactly one of `fields` or `sections`, never both.

## Properties / fields

| Presentation | Required keys | Bounds |
| --- | --- | --- |
| `scalar` / `provenance` | `fields: [{key,label}]` | — |
| `table` | `columns`, `row_key` (must name a column), `max_rows` | `max_rows` is a safe integer 1–500 |
| `references` | `reference_types` (unique, from the allowlist), `max_items` | `max_items` is a safe integer 1–100 |

Every section has a unique `id` (safe identifier grammar) and `title`;
`optional` is the only other allowed key. Duplicate IDs/keys, dotted paths
inside a table's columns, unknown properties, and mixing `fields` with
`sections` all fail closed.

## Backend responsibilities

Authenticate, authorize, validate the detail ID, perform upstream access,
project each declared section (or flat field set), and enforce every bound
(`max_rows`, `max_items`) server-side — never silently truncate past a
declared bound, reject instead.

## Frontend responsibilities

`DetailPanel.jsx` composes [KeyValueResult](key-value.md) (scalar/
provenance), [ResultsTable](table.md) (table sections), and
[ScientificReference](scientific-reference.md) (references sections) — it
never renders a section's raw value itself. Runtime section data is keyed
by section `id`; required sections must be present, optional sections may
be absent.

## Security boundary

Scalar/provenance records contain only declared string/finite-number/
boolean/null values. Provenance fields specifically are checked to never
contain a URI-scheme-looking string (`validStructuredDetailRecord` rejects
a provenance value matching `^[a-z][a-z0-9+.-]*:`) — provenance is facts
about the data's origin, never a clickable destination. Table rows stay
within `max_rows` and only ever contain declared scalar columns. Arbitrary
objects in scalar cells, arbitrary response sections, excess rows, URLs,
HTML, callbacks, component names, and formatters are all rejected.

## States

Loading (`role="status"`, focused heading via `headingRef`), error
(`role="alert"`, does not clear previously shown table rows elsewhere on
the page), no detail selected (`role="status"`, "No detail selected."),
invalid structured data (`role="alert"`, "Invalid structured detail data.").

## Accessibility

A labeled busy region, a focused detail heading on load (`headingRef`,
visually-hidden `<h2>`), logical per-section `<h3>` headings
(`aria-labelledby`), and live loading/error/empty announcements. Child
tables keep their own caption and keyboard-focusable overflow region.

## Scientific-data considerations

Scalar grids reflow to one column on narrow screens; meaningful scientific
values wrap without truncation; missing optional sections are simply
omitted rather than shown empty.

## Example

RCSB PDB structure detail: identity (scalar) + citation authors (table,
optional) + primary references (references, optional) + provenance.

## Rendered behavior

A panel with a focused heading, then either a flat key-value list or one
`<section>` per present section, each rendered via its presentation's
composed component.

## Validation / failure behavior

`validStructuredDetailRecord`/`validScalarRecord` run before rendering;
any mismatch between the declared section contract and the actual response
renders a controlled alert rather than a partial or guessed render.

## Testing

`tests/ui/workbench-structured-detail.test.jsx`,
`tests/ui/workbench-detail-filter.test.jsx`, `tests/ui/query-batch.test.jsx`;
Workbench backend `plugins/shared/tests/test_query_ui.py`.

## Related components

[key-value](key-value.md), [table](table.md), [scientific-reference](scientific-reference.md)
