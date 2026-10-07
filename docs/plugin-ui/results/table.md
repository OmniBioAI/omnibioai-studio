# ResultsTable (`table`)

## Purpose

Present a bounded set of scalar result rows in columns.

## When to use it

Query results and bounded child tables inside a detail section (e.g. a
citation-author list). Any result shape that is a flat list of uniform
scalar records.

## When NOT to use it

- Nested/structured records — use [DetailPanel](detail-panel.md)'s section
  composition instead.
- Anything requiring row actions, sorting, filtering, or per-cell
  formatting/links beyond the fixed "View" detail button `QueryRenderer`
  composes as a trailing cell — the table itself has no actions, fetching,
  sorting, filtering, URLs, or render callbacks in its declarative contract.

## Descriptor contract

```json
{"presentation": "table", "rows_path": "results", "row_key": "pdb_id", "columns": [{"key": "pdb_id", "label": "PDB ID"}, {"key": "score", "label": "Score"}], "detail_key": "pdb_id"}
```

v2 requires `presentation`, `rows_path` (exactly `"results"`), `row_key`,
`columns`. `detail_key` is present only when `capabilities.detail` is `true`
and must also name a real column. v1 retains dotted column paths via
own-property lookup (prototype paths are rejected).

## Properties / fields

| Key | Type | Notes |
| --- | --- | --- |
| `columns` | array of `{key, label}` | Unique, flat keys only; `key` matches the safe identifier grammar |
| `row_key` | string | Must name a declared column; response row identities must be unique, non-empty strings or finite numbers |
| `detail_key` | string | Only with detail capability; must also name a column |

## Backend responsibilities

Project scientific fields and validate response row identity server-side.
Meaningfully large identifiers (those that could lose precision as a JS
number) must arrive as **strings**.

## Frontend responsibilities

`ResultsTable`/`ResultsTableRow` (`src/ui/components/workbench/results/ResultsTable.jsx`)
render exactly the declared columns via `scalarText(valueAt(row, column.key))`
— missing or structured cells render an em dash, never HTML or
`[object Object]`. No precision rounding, column hiding, value
ellipsizing, or local (client-side) pagination/sorting ever happens.

## Security boundary

The table has zero descriptor-level hooks for URLs, callbacks, or dynamic
cell rendering. `ResultsTableRow`/trusted JSX children exist only for
`QueryRenderer`'s own internal detail-button composition — descriptors can
never supply children.

## States

Loading (`role="status"`, "Loading results…"), error (`role="alert"`),
empty ("No results."), success (row count announcement, e.g. "3 results
shown."), invalid data (`<p role="alert">Invalid table data.</p>` when
`columns`/row identities fail validation).

## Accessibility

Semantic `<table>` with `<caption>`, `scope="col"` headers, a named,
keyboard-focusable (`tabIndex={0}`) scroll region (`role="region"
aria-label="{caption} table"`), and live status/error/empty announcements.

## Scientific-data considerations

Wide scientific tables scroll inside their own named region rather than the
page; long identifiers are never ellipsized — they're expected to arrive as
strings precisely to avoid both truncation and JS number-precision loss.

## Example

RCSB PDB's structure-search results table (`pdb_id`, `score` columns);
citation-author child tables inside structure detail.

## Rendered behavior

A table with semantic headers, one row per result, and a live row-count
status line above it.

## Validation / failure behavior

Invalid `columns` or non-unique/missing row identities render a controlled
alert instead of a partially-built table — `validColumns`/`rowKeys` run
before any row is rendered.

## Testing

`tests/ui/workbench-results.test.jsx`, `tests/ui/query-batch.test.jsx`.

## Related components

[pagination](pagination.md), [detail-panel](detail-panel.md)
