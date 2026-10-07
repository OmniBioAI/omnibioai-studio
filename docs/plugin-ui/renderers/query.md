# query

## Purpose / interaction model

Repeated search-and-inspect: submit query inputs, get a bounded scalar
table (optionally paginated/filtered), optionally drill into one
authorized detail lookup per row.

## Intended plugin class

Reference-database/search plugins. Real, production examples: `rcsb_pdb`
and `ensembl` — today the **only two v2-native plugins** in the whole
catalog.

## Descriptor shape it expects

Either schema v1 (a reduced query form: `file`/`text`/`textarea`/`select`/
`resource_select` inputs only, no `checkbox`/`multiselect`/`number`, a
simple `result` table, no pagination/filters/structured detail) or schema
v2 (the full vocabulary: `text`/`textarea`/`number`/`select` inputs,
`result.columns`, optional `pagination`/`detail`/`filters`). See
[descriptor-spec.md](../descriptor-spec.md) for the exact difference — it
matters which version you're targeting before you reach for `number` or
`pagination`.

## Lifecycle

```text
query inputs (PluginForm, optionally grouped via FilterControls)
  -> submit -> GET {endpoints.query}?...params  -> validated response
  -> ResultsTable (+ PaginationControls if declared)
  -> user selects a row -> GET {endpoints.detail}/{detail_id}/ (if capabilities.detail)
  -> DetailPanel
```

Implemented in `src/ui/components/workbench/QueryRenderer.jsx` and
`src/ui/lib/pluginQueryApi.js`. Query-field edits never trigger a request
until submit; pagination requests reuse the last **submitted** values, not
unsubmitted edits; a new search always resets to page 1; aborted/stale
requests can never overwrite newer results (each search gets its own
`AbortController`).

v1-compatibility note: if a v1 query response has `detail_key` but no
`row_key`, the renderer derives row identity from `detail_key` when it's
unique, preserving index-based fallback for still-older responses that
never promised stable identity.

## Backend endpoint responsibilities

- `query` — authenticate, allowlist parameters, normalize/scientifically
  validate values, construct the upstream request, enforce pagination,
  project the declared columns, and return `{"results": [...], "pagination"?}`.
- `detail` (if declared) — validate the detail ID, perform upstream
  access, and project exactly the declared flat fields or sections (see
  [results/detail-panel.md](../results/detail-panel.md)).

Never expose credentials, upstream URLs, or raw upstream payloads through
either endpoint.

## Frontend responsibilities

`QueryRenderer` resolves `table`/`pagination`/`filters`/`detail` purely by
the component names the descriptor declares, via
`resolveWorkbenchComponent()` — if any declared component fails to
resolve, it renders "Unsupported query presentation" instead of a partial
page.

## Security boundary

Full [security-model.md](../security-model.md) FORM flow; query parameter
keys are validated against the safe identifier grammar
(`isDataPath`) before ever being appended to a URL.

## States / terminal states

Not applicable in the run sense — query has no terminal run state; it has
loading/error/empty/populated states per search and per detail lookup,
independently.

## Testing

`tests/ui/query-renderer.test.jsx`, `tests/ui/query-batch.test.jsx`,
`tests/ui/plugin-batch-contracts.test.js`.

## Related

[results/table.md](../results/table.md),
[results/pagination.md](../results/pagination.md),
[results/detail-panel.md](../results/detail-panel.md),
[results/filters.md](../results/filters.md),
[descriptor-spec.md](../descriptor-spec.md)
