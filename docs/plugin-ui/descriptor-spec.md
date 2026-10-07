# Descriptor specification

The descriptor is the JSON object Django returns from
`GET /plugins/{slug}/api/ui-schema/`. It is validated by
`validatePluginDescriptor()` in `src/ui/lib/pluginApi.js` before any component
ever sees it. This page documents the real, current contract — not an
aspirational one. There are exactly two schema versions: **1** and **2**.
There is no schema v3.

## Common envelope

```json
{
  "schema_version": 1,
  "plugin": {"slug": "...", "name": "...", "version": "...", "description": "...", "category": "..."},
  "renderer": "async_analysis",
  "native_supported": true,
  "inputs": [...],
  "outputs": [...]
}
```

For both versions, the payload must be an object with a `plugin` object;
`schema_version` must be the integer `1` or `2`; `plugin.slug` must equal the
slug the frontend requested; and `renderer`/`native_supported` must be a
string/boolean. Native descriptors additionally require string `name`,
`version`, `description`, and `category` metadata. A v2 descriptor has a
strict top-level allowlist; v1 then applies the renderer-specific contracts
below.

If v1 `native_supported` is `false`, the descriptor is still scanned by
`rejectExecutableMetadata` (so a legacy descriptor can never smuggle
executable-looking metadata even though it isn't rendered natively), and the
page falls back to `ServiceViewer`. Schema v2 has no legacy form:
`validateBatchQueryDescriptor` requires `native_supported: true`.

## Renderer/version matrix

| Schema | Renderer name | Required contract | Optional contract |
| --- | --- | --- | --- |
| v1 | `async_analysis` or `generic_runner` | `inputs`, `outputs`; submit/status/logs/artifacts/download capabilities and endpoints | static-PNG `result` + render capability/endpoint; artifact list; conditional fields |
| v1 | `query` | inputs/outputs, query capability/endpoint, table result | detail capability/endpoint and `detail_key`; conditional fields |
| v1 | `informational` | empty inputs/outputs, `read_only: true`, finite text `content` | none |
| v2 | `query` | non-empty inputs, empty outputs, query capability/endpoint, table result | pagination, filters, detail |

No other renderer/version pairing is accepted.

## Schema version 1

v1 is the original vocabulary. It backs all legacy-compatible native plugins
and supports:

- Renderers: `async_analysis`, `generic_runner` (alias of `async_analysis`),
  `informational`, `query`.
- Field components: `file`, `text`, `textarea`, `select`, `checkbox`,
  `multiselect`, `resource_select` — **not** `number`. The real frontend field
  validator (`validateField` in `pluginApi.js`) only recognizes
  `["file", "text", "textarea", "select", "checkbox", "multiselect", "resource_select"]`;
  a `number` component on a v1/async_analysis descriptor fails validation.
- Conditional fields: a field may declare `conditions`, each
  `{"controller", "operator": "equals", "value", "effect": "visible"|"required"}`,
  where `controller` must name another field that is itself a `select` with
  a matching `choices` entry, condition chains are rejected (a field used as a
  controller cannot itself have `conditions`), and a field cannot declare two
  conditions with the same `effect`. This is the complete conditional
  grammar — there is no generic expression engine.
- Static PNG results (`result.presentation: "static_png"`) and artifact
  listing (`artifacts: {"presentation": "list", "max_items": N}`) under
  `async_analysis`. Static PNG also requires `capabilities.render: true` and
  a matching `endpoints.render`; artifacts require the fixed opaque-ID
  download endpoint.
- v1 `query` renderer descriptors — a reduced table-result contract with an
  optional detail lookup. It has no descriptor-defined `row_key`, pagination,
  filters, structured detail sections, or references vocabulary (and no
  `number`, `checkbox`, or `multiselect` fields; the query validator explicitly
  rejects the latter two for this renderer).

## Schema version 2

v2 is **query-only** today — `validateBatchQueryDescriptor` requires
`data.renderer === "query"`; there is no v2 form for `async_analysis` or
`informational`. v2 adds the structured result/detail/pagination/filters
vocabulary, at the cost of a narrower field vocabulary:

- Field components: `text`, `textarea`, `number`, `select` only
  (`validBatchField` in `src/ui/lib/pluginUiContracts.js`). **No** `file`,
  `checkbox`, `multiselect`, `resource_select`, and **no conditional fields**
  — `validateBatchQueryDescriptor` never calls the conditional-input
  validator.
- `number` fields: `format` is `"integer"` or `"float"`; optional `min`,
  `max`, `step`, `unit`. Integer values must be safe integers; `min` must not
  exceed `max`; a declared `default` must lie within bounds; `step` must be
  positive and finite, except `"any"` is allowed only when `format` is
  `"float"`; `unit` is plain text up to 32 characters.
- `result` (required): `{"presentation": "table", "rows_path": "results", "row_key", "columns": [{"key","label"}, ...], "detail_key"?}`.
  `rows_path` must be exactly `"results"`. `row_key` and every column `key`
  must name a real column and match the safe identifier grammar below.
- `pagination` (optional): `{"component": "pagination", "mode": "page"}` plus
  a required `number`/`integer` input named `page_size`; a descriptor may
  never declare its own `page` input (the frontend owns that query
  parameter).
- `detail` (optional, requires `capabilities.detail: true`): either a flat
  form, `{"component":"detail","title","fields":[{"key","label"}, ...]}`, or a
  sectioned form with one ordered level of `sections`, each
  `{"id","title","presentation": "scalar"|"table"|"provenance"|"references", ...}`.
  See [results/detail-panel.md](results/detail-panel.md) and
  [results/scientific-reference.md](results/scientific-reference.md) for the
  full per-presentation contract. Sections never nest.
- `filters` (optional): `{"component":"filters","title","field_ids":[...]}` —
  every ID must name an existing, **optional**, `text`/`select`/`number`
  input; a filter block can never reference every input (it must leave at
  least one input un-referenced) and can never introduce new fields or
  operators.

## The identifier grammar (both versions)

- Field IDs and v2 presentation identifiers (simple column/detail keys,
  section IDs, and filter `field_ids`) match `^[a-z][a-z0-9_]*$`. V1 output
  IDs use the plugin-slug grammar `^[a-z0-9][a-z0-9_-]*$` instead.
- The following are forbidden for field and v2 presentation identifiers:
  `__proto__`, `prototype`, `constructor`, `password`, `token`, `api_key`,
  `secret`, `credentials`.
- Dotted data paths (`"a.b"`) are accepted only in v1 query column/detail
  positions that use `isDataPath`; v2 result columns and structured-detail
  table columns explicitly forbid dots. Data-path lookup never resolves
  through the prototype chain.

## Forbidden metadata (both versions, always)

`rejectExecutableMetadata` walks the **entire** descriptor recursively (depth
limit 30) and throws on any key matching this exact pattern, case-insensitive:

```text
__proto__, prototype, constructor, jsx, javascript, script, script_url, html,
raw_html, dangerouslySetInnerHTML, callback, callbacks, event_handler,
expression, onChange, onClick, onSubmit, onLoad, onError, module, module_path,
import, imports, eval, function, function_name, credentials, password, token,
access_token, api_key, secret, secrets, source_path, filesystem_path,
upstream_url
```

See [security-model.md](security-model.md) for why each of these exists.

## Endpoints

Every endpoint string in a descriptor must match a fixed shape:
`/plugins/{slug}/(api/)?(run|status|log|artifacts|file|render|search|studies|experiments|variants|pathways|genes|ui-query|ui-detail|ui-reference|ui-artifacts|ui-resources)/...`,
and the `{slug}` segment must equal the plugin's own slug — a descriptor can
never point at another plugin's endpoint or an arbitrary path. Descriptor
endpoints may not contain a query string; `..` and `//` are always rejected.
Renderer-specific validation narrows this general grammar further. In
particular, v2 uses the exact `ui-query`/`ui-detail` paths, resource selection
uses the exact `ui-resources/{resource_type}/` path, and artifact downloads
use the exact `ui-artifacts/{run_id}/{artifact_id}/download/` path.

## Unknown version / unknown renderer / unknown widget / malformed descriptor

- Unknown `schema_version` (anything other than `1` or `2`): the whole
  descriptor is rejected as invalid before any renderer-specific checks run.
- Unknown `renderer` string on a v1, `native_supported: true` descriptor: the
  frontend only accepts `async_analysis`, `generic_runner`, `informational`,
  `query` (`NATIVE_RENDERERS`); anything else throws `PluginDescriptorError`
  before it reaches `resolveWorkbenchRenderer`.
- Unknown field `component`/`widget`: rejected by `validateField` /
  `validBatchField` at descriptor-validation time, and defensively rejected
  again at render time by `PluginField` (`WORKBENCH_FIELD_TYPES.includes(type)`).
- Any malformed shape anywhere: `validatePluginDescriptor` catches any
  non-`PluginDescriptorError` exception and re-throws a generic
  `PluginDescriptorError("Workbench returned an invalid plugin descriptor.")`
  — a malformed descriptor never surfaces a raw `TypeError` or a
  partially-rendered page.
- All of the above, plus a 404 from the `ui-schema` endpoint, result in the
  **same** fallback: the legacy `ServiceViewer`.

## Legacy `native_supported: false`

A plugin can ship a descriptor with `native_supported: false` (for example,
during migration, before parity is proven — see
[migration-guide.md](migration-guide.md)). The descriptor is still fetched and
scanned for forbidden metadata, but no renderer is resolved and the page
renders `ServiceViewer` unconditionally. This lets a backend start emitting a
real (but not yet trusted) descriptor without changing the page a single user
sees.

## Complete minimal examples

**v1, `async_analysis`** (the minimum an analysis plugin needs):

```json
{
  "schema_version": 1,
  "plugin": {"slug": "my_analysis", "name": "My Analysis", "version": "1.0.0", "description": "Runs an analysis.", "category": "analysis"},
  "renderer": "async_analysis",
  "native_supported": true,
  "inputs": [
    {"id": "sample_id", "component": "text", "format": "text", "label": "Sample ID", "description": "Identifier of the sample to analyze.", "required": true}
  ],
  "outputs": [],
  "capabilities": {"submit": true, "status": true, "logs": true, "artifacts": true, "downloads": true},
  "endpoints": {
    "submit": "/plugins/my_analysis/api/run/",
    "status": "/plugins/my_analysis/api/status/{run_id}/",
    "logs": "/plugins/my_analysis/api/log/{run_id}/",
    "artifacts": "/plugins/my_analysis/api/artifacts/{run_id}/",
    "download": "/plugins/my_analysis/api/ui-artifacts/{run_id}/{artifact_id}/download/"
  }
}
```

**v2, `query`** (the real, reduced RCSB PDB shape):

```json
{
  "schema_version": 2,
  "plugin": {"slug": "rcsb_pdb", "name": "RCSB PDB Integration", "version": "1.0.1", "description": "Search public RCSB structures.", "category": "reference_db"},
  "renderer": "query",
  "native_supported": true,
  "inputs": [
    {"id": "pdb_id", "component": "text", "format": "text", "label": "PDB ID", "description": "Optional structure accession.", "required": false},
    {"id": "organism", "component": "text", "format": "text", "label": "Organism", "description": "Optional source organism filter.", "required": false}
  ],
  "outputs": [],
  "capabilities": {"query": true, "detail": true},
  "endpoints": {"query": "/plugins/rcsb_pdb/api/ui-query/", "detail": "/plugins/rcsb_pdb/api/ui-detail/{detail_id}/"},
  "result": {"presentation": "table", "rows_path": "results", "row_key": "pdb_id", "detail_key": "pdb_id", "columns": [{"key": "pdb_id", "label": "PDB ID"}]},
  "filters": {"component": "filters", "title": "Filters", "field_ids": ["organism"]},
  "detail": {"component": "detail", "title": "Structure detail", "sections": [
    {"id": "identity", "title": "Structure identity", "presentation": "scalar", "fields": [{"key": "pdb_id", "label": "PDB ID"}]},
    {"id": "provenance", "title": "Provenance", "presentation": "provenance", "fields": [{"key": "source", "label": "Source database"}]}
  ]}
}
```

## Related

- [security-model.md](security-model.md)
- [renderer-selection.md](renderer-selection.md)
- [fields/README.md](fields/README.md), [results/README.md](results/README.md)
